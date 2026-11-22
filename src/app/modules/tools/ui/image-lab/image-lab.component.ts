import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { ModelSelectComponent } from '@modules/agency/ui/model-select/model-select.component';
import { ActiveProjectPickerComponent } from '@modules/projects/ui/active-project-picker/active-project-picker.component';
import { FileAsset } from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { UiIcon } from '@shared/components/ui-icon/ui-icon.component';
import { LightingSelectComponent } from '@shared/components/lighting/lighting-select.component';
import { lightingPrompt } from '@shared/components/lighting/lighting-templates';
import { downloadRemoteFile } from '@utils/download-url';
import { environment } from '@env/environment';

import {
  IMAGE_LAB_PIECE_CODE,
  IMAGE_LAB_PREFERRED_MODELS,
  LOCATION_DEFAULT_RATIO,
  LOCATION_DEFAULT_RESOLUTION,
  LOCATION_RATIO_OPTIONS,
  LOCATION_RESOLUTION_PREFERENCE,
  LOCATION_RESOLUTIONS_FALLBACK,
  LocationRatioOption,
  TOOLS_LOADING_POSTER,
  TOOLS_LOADING_VIDEO,
} from '../../interfaces';
import { PoseSheetAnchor, ToolsService } from '../../services';

const REF_MAX_BYTES = 10 * 1024 * 1024;
const REF_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
/** OpenRouter acepta hasta 16 imágenes de referencia por pedido. */
const MAX_REFS = 16;
const MIN_LOADING_MS = 650;
const PROGRESS_EXPECTED_MS = 75_000;

/**
 * Estudio de imagen (Herramientas): genera y edita imágenes con IA desde un
 * prompt libre y referencias opcionales, con ratio/resolución por modelo.
 */
@Component({
  selector: 'app-image-lab',
  imports: [
    FormsModule,
    TranslatePipe,
    Button,
    Message,
    ModelSelectComponent,
    ActiveProjectPickerComponent,
    Select,
    Tag,
    ServerUrlPipe,
    UiIcon,
    LightingSelectComponent,
  ],
  templateUrl: './image-lab.component.html',
  styleUrl: './image-lab.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLabComponent {
  private readonly toolsService = inject(ToolsService);
  private readonly libraryService = inject(LibraryService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiOrigin = environment.API_URL.replace(/\/api\/v1\/?$/, '');

  private readonly loadingMedia = viewChild<ElementRef<HTMLVideoElement>>('loadingMediaRef');

  protected readonly preferredModels = IMAGE_LAB_PREFERRED_MODELS;
  protected readonly ratioOptions = LOCATION_RATIO_OPTIONS;
  protected readonly loadingVideo = TOOLS_LOADING_VIDEO;
  protected readonly loadingPoster = TOOLS_LOADING_POSTER;

  /** Nombre del modelo elegido en el select (lo que recibe el back). */
  protected readonly selectedModel = signal('');
  /** Modelo completo, para leer ratios y resoluciones soportadas. */
  protected readonly activeModel = signal<AiModel | null>(null);
  /** Esquema de iluminación / dirección de arte de la imagen. */
  protected readonly lighting = signal<string | null>(null);

  protected readonly ratio = signal<string>(LOCATION_DEFAULT_RATIO);
  protected readonly resolution = signal<string>(LOCATION_DEFAULT_RESOLUTION);

  /** Ratios que declara el modelo elegido (null = sin restricción). */
  protected readonly allowedRatios = computed<readonly string[] | null>(() => {
    const ratios = this.activeModel()?.defaults?.ratios;
    return ratios && ratios.length > 0 ? ratios : null;
  });

  protected readonly visibleRatioOptions = computed<LocationRatioOption[]>(() => {
    const allowed = this.allowedRatios();
    return allowed
      ? this.ratioOptions.filter((r) => allowed.includes(r.value))
      : [...this.ratioOptions];
  });

  protected readonly resolutionOptions = computed<string[]>(() => {
    const res = this.activeModel()?.defaults?.resolutions;
    return res && res.length > 0 ? [...res] : [...LOCATION_RESOLUTIONS_FALLBACK];
  });

  /**
   * Al cambiar de modelo ajusta ratio/resolución a valores soportados: cae a
   * la relación horizontal más ancha disponible y a la mejor resolución.
   */
  private readonly keepFormatValid = effect(() => {
    const ratios = this.visibleRatioOptions();
    if (ratios.length > 0 && !ratios.some((r) => r.value === this.ratio())) {
      const widest = ratios.reduce((a, b) => (b.w / b.h > a.w / a.h ? b : a));
      this.ratio.set(widest.value);
    }
    const resolutions = this.resolutionOptions();
    if (resolutions.length > 0 && !resolutions.includes(this.resolution())) {
      const preferred =
        LOCATION_RESOLUTION_PREFERENCE.find((r) => resolutions.includes(r)) ?? resolutions[0];
      this.resolution.set(preferred);
    }
  });

  protected readonly prompt = signal('');
  protected readonly refs = signal<readonly FileAsset[]>([]);
  protected readonly uploadingRefs = signal(false);

  protected readonly generating = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<readonly StatusOutput[]>([]);
  protected readonly saving = signal(false);
  protected readonly savedName = signal<string | null>(null);

  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private anchor: PoseSheetAnchor | null = null;
  /** Tarea de la generación mostrada: enlaza el recurso guardado con su log. */
  private lastTaskId = '';

  protected readonly canGenerate = computed(
    () => !!this.selectedModel() && this.prompt().trim().length > 0 && !this.generating(),
  );

  protected readonly metaSummary = computed(() => `${this.ratio()} · ${this.resolution()}`);

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
    this.destroyRef.onDestroy(() => this.stopProgressRamp());
  }

  protected onRatioChange(value: string | null): void {
    if (!value) {
      return;
    }
    const allowed = this.allowedRatios();
    if (allowed && !allowed.includes(value)) {
      return;
    }
    this.ratio.set(value);
  }

  protected onRefsPicked(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = input ? Array.from(input.files ?? []) : [];
    if (input) {
      input.value = '';
    }
    const valid = files.filter((f) => REF_MIME_TYPES.includes(f.type) && f.size <= REF_MAX_BYTES);
    const room = MAX_REFS - this.refs().length;
    const batch = valid.slice(0, Math.max(0, room));
    if (batch.length === 0) {
      return;
    }
    this.uploadingRefs.set(true);
    forkJoin(batch.map((file) => this.libraryService.uploadFile(file, 'images')))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadingRefs.set(false)),
      )
      .subscribe({
        next: (assets) => this.refs.update((refs) => [...assets, ...refs]),
        error: () => this.error.set(this.translate.instant('TOOLS.IMAGE_LAB_REFS_ERROR')),
      });
  }

  protected removeRef(id: string): void {
    this.refs.update((refs) => refs.filter((ref) => ref.id !== id));
  }

  protected generate(): void {
    const model = this.selectedModel();
    const prompt = this.composePrompt();
    if (!model || !prompt || this.generating()) {
      return;
    }
    const startedAt = Date.now();
    this.generating.set(true);
    this.progress.set(null);
    this.startProgressRamp();
    this.error.set(null);
    this.result.set([]);
    this.savedName.set(null);
    this.toolsService
      .ensureImageLabAnchor(this.translate.instant('TOOLS.IMAGE_LAB_ANCHOR'))
      .pipe(
        mergeMap((anchor) => {
          this.anchor = anchor;
          return this.toolsService.generateImageLab({
            model,
            prompt,
            ratio: this.ratio(),
            resolution: this.resolution(),
            referenceIds: this.refs().map((ref) => ({ id: ref.id, name: ref.filename })),
            eventId: anchor.project.id,
            pieceId: anchor.piece.id,
            pieceCode: IMAGE_LAB_PIECE_CODE,
          });
        }),
        mergeMap((gen) => {
          this.lastTaskId = gen.taskId;
          this.applyOutputs(gen.outputs ?? []);
          return this.toolsService.trackImageLab(gen.taskId);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.finishLoading(startedAt)),
      )
      .subscribe({
        next: (status) => {
          if (
            typeof status.progress_percent === 'number' &&
            status.progress_percent > (this.progress() ?? 0)
          ) {
            this.progress.set(status.progress_percent);
          }
          if (status.status === 'succeeded' || status.status === 'completed') {
            const outputs = status.outputs ?? [];
            if (outputs.length > 0) {
              this.applyOutputs(outputs);
            } else if (this.result().length === 0) {
              this.error.set(this.translate.instant('TOOLS.IMAGE_LAB_NO_OUTPUT'));
            }
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            this.error.set(this.describeError(status.error ?? status.status));
          }
        },
        error: (err: unknown) => this.error.set(this.describeError(err)),
      });
  }

  protected download(): void {
    const output = this.result()[0];
    if (!output?.url) {
      return;
    }
    void downloadRemoteFile(this.absoluteUrl(output.url), 'image-lab.png');
  }

  protected saveToResources(): void {
    const output = this.result()[0];
    const anchor = this.anchor;
    if (!output?.url || !anchor || this.saving()) {
      return;
    }
    this.saving.set(true);
    const prompt = this.prompt().trim();
    const name = prompt ? prompt.slice(0, 60) : 'Imagen de estudio';
    this.toolsService
      .saveImageLabAsProp({
        outputUrl: output.url,
        name,
        eventId: anchor.project.id,
        taskId: this.lastTaskId || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (ingredient) => this.savedName.set(ingredient.name),
        error: () => undefined,
      });
  }

  private composePrompt(): string {
    const prompt = this.prompt().trim();
    if (!prompt) {
      return '';
    }
    return [prompt, lightingPrompt(this.lighting())].filter(Boolean).join('\n\n');
  }

  private applyOutputs(outputs: readonly StatusOutput[]): void {
    if (outputs.length === 0) {
      return;
    }
    this.result.set(outputs);
    this.progress.set(100);
  }

  private describeError(err: unknown): string {
    const http = err as Partial<HttpErrorResponse> | null;
    const payload = http?.error;
    let message = '';

    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      const body = payload as { message?: unknown };
      if (typeof body.message === 'string') {
        message = body.message;
      }
    }
    if (!message && typeof http?.message === 'string') {
      message = http.message;
    }

    if (
      http?.status === 429 ||
      /RESOURCE_EXHAUSTED|free_tier|free tier|Quota exceeded|"code"\s*:\s*429/i.test(message)
    ) {
      return this.translate.instant('TOOLS.IMAGE_LAB_QUOTA_ERROR');
    }

    return this.providerMessage(message) || this.translate.instant('TOOLS.IMAGE_LAB_ERROR');
  }

  /** El back puede devolver el JSON del proveedor como string dentro de message. */
  private providerMessage(message: string): string {
    const trimmed = message.trim();
    if (!trimmed.startsWith('{')) {
      return trimmed;
    }
    try {
      const body = JSON.parse(trimmed) as {
        error?: { message?: string };
        message?: string;
      };
      return body.error?.message ?? body.message ?? trimmed;
    } catch {
      return trimmed;
    }
  }

  private startProgressRamp(): void {
    this.stopProgressRamp();
    const startedAt = Date.now();
    this.progress.set(1);
    this.progressTimer = setInterval(() => {
      const ratio = (Date.now() - startedAt) / PROGRESS_EXPECTED_MS;
      const pct = Math.min(95, Math.round(3 + 92 * (1 - Math.exp(-1.5 * ratio))));
      this.progress.set(pct);
    }, 400);
  }

  private stopProgressRamp(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private finishLoading(startedAt: number): void {
    this.stopProgressRamp();
    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
    if (wait === 0) {
      this.generating.set(false);
      return;
    }
    setTimeout(() => this.generating.set(false), wait);
  }

  private absoluteUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    return `${this.apiOrigin}${url.startsWith('/') ? url : `/${url}`}`;
  }
}
