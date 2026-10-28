import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Dialog } from 'primeng/dialog';
import { firstValueFrom, switchMap, takeWhile, timer } from 'rxjs';

import { EditorProject, RENDER_FORMATS, RenderFormat, RenderJob } from '../../interfaces';
import { EditorService } from '../../services';

/** Tipos mínimos de la File System Access API (Chrome/Edge). */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
interface FileHandleLike {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileHandleLike>;

const MIME: Record<RenderFormat, string> = {
  mp4: 'video/mp4',
  mp4_h265: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  gif: 'image/gif',
};

/**
 * Modal de exportación: elige formato/códec, renderiza en el servidor y baja el
 * archivo a la computadora. El servidor borra el temporal al entregarlo, así
 * que el video no queda guardado en la plataforma.
 */
@Component({
  selector: 'app-export-dialog',
  imports: [Dialog, TranslatePipe],
  templateUrl: './export-dialog.component.html',
  styleUrl: './export-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialogComponent {
  private readonly editorService = inject(EditorService);
  private readonly translate = inject(TranslateService);

  readonly visible = model(false);
  readonly projectId = input<string | null>(null);
  readonly project = input.required<EditorProject>();

  protected readonly formats = RENDER_FORMATS;
  protected readonly format = signal<RenderFormat>('mp4');
  protected readonly job = signal<RenderJob | null>(null);
  protected readonly starting = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly busy = computed(() => {
    const s = this.job()?.status;
    return s === 'queued' || s === 'running';
  });
  protected readonly ready = computed(() => this.job()?.status === 'succeeded');
  protected readonly progress = computed(() => this.job()?.progress ?? 0);

  protected readonly extension = computed(
    () => this.formats.find((f) => f.value === this.format())?.ext ?? 'mp4',
  );

  protected pick(format: RenderFormat): void {
    if (!this.busy()) {
      this.format.set(format);
    }
  }

  protected close(): void {
    if (this.busy() || this.saving()) {
      return;
    }
    this.visible.set(false);
    this.reset();
  }

  private reset(): void {
    this.job.set(null);
    this.error.set(null);
    this.saved.set(false);
    this.starting.set(false);
    this.saving.set(false);
  }

  protected async render(): Promise<void> {
    const id = this.projectId();
    if (!id || this.busy() || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const job = await firstValueFrom(
        this.editorService.startRender(id, this.project(), this.format(), false),
      );
      this.job.set(job);
      timer(1500, 1500)
        .pipe(
          switchMap(() => this.editorService.getJob(job.id)),
          takeWhile((j) => j.status === 'queued' || j.status === 'running', true),
        )
        .subscribe({
          next: (j) => this.job.set(j),
          error: () => this.error.set(this.translate.instant('EDITOR.EXPORT_DIALOG.RENDER_ERROR')),
        });
    } catch (err) {
      this.error.set(this.errorText(err, 'EDITOR.EXPORT_DIALOG.RENDER_ERROR'));
    } finally {
      this.starting.set(false);
    }
  }

  /**
   * Guarda en la computadora. Primero abre el selector de archivos (necesita el
   * gesto del usuario) y recién después pide el archivo al servidor.
   */
  protected async saveToPc(): Promise<void> {
    const job = this.job();
    if (!job || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const name = `video-${new Date().toISOString().slice(0, 10)}.${this.extension()}`;
    try {
      const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
        .showSaveFilePicker;
      let handle: FileHandleLike | null = null;
      if (picker) {
        try {
          handle = await picker.call(window, {
            suggestedName: name,
            types: [
              { description: 'Video', accept: { [MIME[this.format()]]: ['.' + this.extension()] } },
            ],
          });
        } catch (err) {
          if ((err as { name?: string }).name === 'AbortError') {
            return;
          }
          handle = null;
        }
      }
      const blob = await firstValueFrom(this.editorService.downloadJob(job.id));
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // El navegador necesita el blob vivo mientras arranca la descarga.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      this.saved.set(true);
    } catch (err) {
      this.error.set(this.errorText(err, 'EDITOR.EXPORT_DIALOG.SAVE_ERROR'));
    } finally {
      this.saving.set(false);
    }
  }

  private errorText(err: unknown, fallbackKey: string): string {
    if (err instanceof HttpErrorResponse) {
      const message = (err.error as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && message) {
        return message;
      }
    }
    return this.translate.instant(fallbackKey);
  }
}
