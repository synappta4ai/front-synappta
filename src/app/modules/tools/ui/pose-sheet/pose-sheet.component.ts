import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { AiModel, StatusOutput } from '@modules/agency/interfaces';
import { FileAsset } from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { UiIcon } from '@shared/components/ui-icon/ui-icon.component';

import {
  POSE_SHEET_PIECE_CODE,
  POSE_SHEET_VARIANTS,
  PoseSheetVariant,
  TOOLS_LOADING_POSTER,
  TOOLS_LOADING_VIDEO,
} from '../../interfaces';
import { PoseSheetAnchor, ToolsService } from '../../services';

const REF_MAX_BYTES = 10 * 1024 * 1024;
const REF_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
const MIN_LOADING_MS = 650;

/**
 * Hoja de poses (Herramientas): genera con Gemini 3 Pro Image una hoja
 * estructurada del personaje y la guarda en Recursos como ingrediente
 * character. Las instrucciones son visibles y editables por el usuario.
 */
@Component({
  selector: 'app-pose-sheet',
  imports: [FormsModule, TranslatePipe, Button, Message, Select, Tag, ServerUrlPipe, UiIcon],
  templateUrl: './pose-sheet.component.html',
  styleUrl: './pose-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PoseSheetComponent implements OnInit {
  private readonly toolsService = inject(ToolsService);
  private readonly libraryService = inject(LibraryService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly loadingMedia = viewChild<ElementRef<HTMLVideoElement>>('loadingMediaRef');

  constructor() {
    effect(() => {
      const video = this.loadingMedia()?.nativeElement;
      if (!video || !this.generating()) {
        return;
      }
      video.muted = true;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    });
  }

  protected readonly variants = POSE_SHEET_VARIANTS;
  protected readonly loadingVideo = TOOLS_LOADING_VIDEO;
  protected readonly loadingPoster = TOOLS_LOADING_POSTER;

  protected readonly models = signal<AiModel[]>([]);
  protected readonly loadingModels = signal(true);
  protected readonly selectedModel = signal('');
  protected readonly activeModel = computed(
    () => this.models().find((m) => m.name === this.selectedModel()) ?? null,
  );

  protected readonly variant = signal<PoseSheetVariant>('body');
  protected readonly defaultPrompt = signal('');
  protected readonly editedPrompt = signal('');
  protected readonly loadingPrompt = signal(false);
  protected readonly promptDirty = computed(() => this.editedPrompt() !== this.defaultPrompt());

  protected readonly characterName = signal('');
  protected readonly characterDesc = signal('');

  protected readonly refs = signal<readonly FileAsset[]>([]);
  protected readonly uploadingRefs = signal(false);

  protected readonly generating = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<readonly StatusOutput[]>([]);

  private anchor: PoseSheetAnchor | null = null;
  protected readonly saving = signal(false);
  protected readonly savedName = signal<string | null>(null);

  ngOnInit(): void {
    this.toolsService
      .listPoseSheetModels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (models) => {
          this.models.set(models);
          const first = models[0];
          if (first && !this.selectedModel()) {
            this.selectedModel.set(first.name);
          }
          this.loadingModels.set(false);
        },
        error: () => this.loadingModels.set(false),
      });
    this.loadPrompt('body');
  }

  protected onVariantChange(variant: PoseSheetVariant): void {
    if (variant === this.variant() || this.loadingPrompt()) {
      return;
    }
    this.variant.set(variant);
    this.loadPrompt(variant);
  }

  protected resetPrompt(): void {
    this.editedPrompt.set(this.defaultPrompt());
  }

  protected onRefsPicked(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = input ? Array.from(input.files ?? []) : [];
    if (input) {
      input.value = '';
    }
    const valid = files.filter((f) => REF_MIME_TYPES.includes(f.type) && f.size <= REF_MAX_BYTES);
    if (valid.length === 0) {
      return;
    }
    this.uploadingRefs.set(true);
    forkJoin(valid.map((file) => this.libraryService.uploadFile(file, 'images')))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadingRefs.set(false)),
      )
      .subscribe({
        next: (assets) => this.refs.update((refs) => [...assets, ...refs]),
        error: () => this.error.set(this.translate.instant('TOOLS.REFS_HINT')),
      });
  }

  protected removeRef(id: string): void {
    this.refs.update((refs) => refs.filter((r) => r.id !== id));
  }

  protected generate(): void {
    const model = this.selectedModel();
    const prompt = this.composePrompt();
    if (!model || !prompt.trim() || this.generating()) {
      return;
    }
    const startedAt = Date.now();
    this.generating.set(true);
    this.progress.set(null);
    this.error.set(null);
    this.result.set([]);
    this.savedName.set(null);
    this.toolsService
      .ensureAnchor(this.translate.instant('TOOLS.ANCHOR_PROJECT'))
      .pipe(
        mergeMap((anchor) => {
          this.anchor = anchor;
          return this.toolsService.generatePoseSheet({
            model,
            prompt,
            referenceIds: this.refs().map((r) => ({ id: r.id, name: r.filename })),
            eventId: anchor.project.id,
            pieceId: anchor.piece.id,
            pieceCode: POSE_SHEET_PIECE_CODE,
          });
        }),
        mergeMap((gen) => this.toolsService.trackPoseSheet(gen.taskId)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.finishLoading(startedAt)),
      )
      .subscribe({
        next: (status) => {
          if (typeof status.progress_percent === 'number') {
            this.progress.set(status.progress_percent);
          }
          if (status.status === 'succeeded' || status.status === 'completed') {
            const outputs = status.outputs ?? [];
            this.result.set(outputs);
            // Guardado automático en Recursos como personaje; el botón
            // manual queda como reintento si el auto-guardado falla.
            if (outputs[0]?.url && !this.savedName() && !this.saving()) {
              this.saveAsCharacter();
            }
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            this.error.set(status.error ?? status.status);
          }
        },
        error: (err: unknown) => this.error.set(err instanceof Error ? err.message : String(err)),
      });
  }

  private finishLoading(startedAt: number): void {
    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
    if (wait === 0) {
      this.generating.set(false);
      return;
    }
    setTimeout(() => this.generating.set(false), wait);
  }

  protected saveAsCharacter(): void {
    const output = this.result()[0];
    const anchor = this.anchor;
    if (!output?.url || !anchor || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const fallback = `Pose sheet ${new Date().toLocaleDateString()}`;
    this.toolsService
      .savePoseSheetAsCharacter({
        outputUrl: output.url,
        name: this.characterName().trim() || fallback,
        description: this.characterDesc().trim() || undefined,
        eventId: anchor.project.id,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: ({ ingredient }) => this.savedName.set(ingredient.name),
        error: (err: unknown) => this.error.set(err instanceof Error ? err.message : String(err)),
      });
  }

  private loadPrompt(variant: PoseSheetVariant): void {
    this.loadingPrompt.set(true);
    this.toolsService
      .loadSystemPrompt(variant)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingPrompt.set(false)),
      )
      .subscribe({
        next: (text) => {
          this.defaultPrompt.set(text.trim());
          this.editedPrompt.set(text.trim());
        },
        error: () => this.error.set(this.translate.instant('TOOLS.LOADING_PROMPT')),
      });
  }

  private composePrompt(): string {
    const parts = [this.editedPrompt().trim()];
    const name = this.characterName().trim();
    const desc = this.characterDesc().trim();
    const who = [name, desc].filter(Boolean).join(' — ');
    if (who) {
      parts.push(`Character: ${who}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }
}
