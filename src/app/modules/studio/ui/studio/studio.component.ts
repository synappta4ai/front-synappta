import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { Select } from 'primeng/select';
import { PrimeTemplate } from 'primeng/api';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Message } from 'primeng/message';

import { AgencyService } from '@modules/agency/services';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { GenerationEventsStore } from '@core/store/generation.events';
import { environment } from '@env/environment';

import { StudioService } from '../../services/studio.service';
import { StudioModel, StudioTake } from '../../interfaces';

interface RatioOption {
  label: string;
  value: string;
  w: number;
  h: number;
}

interface RefSlotDef {
  key: 'character' | 'location' | 'props';
  label: string;
  hint: string;
}

const REF_SLOT_DEFS: RefSlotDef[] = [
  { key: 'character', label: 'Personaje', hint: 'png, jpeg' },
  { key: 'location', label: 'Localización', hint: 'png, jpeg' },
  { key: 'props', label: 'Props', hint: 'png, jpeg' },
];

@Component({
  selector: 'app-studio',
  imports: [FormsModule, Button, Popover, Select, PrimeTemplate, Tag, Tooltip, Message, ServerUrlPipe],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioComponent {
  private readonly studioService = inject(StudioService);
  private readonly agencyService = inject(AgencyService);
  private readonly libraryService = inject(LibraryService);

  // ─── Catalog ───────────────────────────────────────────────────
  protected readonly models = signal<StudioModel[]>([]);
  protected readonly loadingModels = signal(false);
  protected readonly selectedModel = signal<StudioModel | null>(null);

  protected readonly videoModels = computed(() => this.models().filter((m) => m.modality === 'video'));
  protected readonly imageModels = computed(() => this.models().filter((m) => m.modality === 'image'));

  protected readonly mode = signal<'video' | 'image'>('video');
  protected readonly modeModels = computed(() =>
    this.mode() === 'video' ? this.videoModels() : this.imageModels(),
  );

  // ─── Prompt & params ───────────────────────────────────────────
  protected readonly prompt = signal('');
  protected readonly negativePrompt = signal('');
  protected readonly ratio = signal('16:9');
  protected readonly resolution = signal('720p');
  protected readonly duration = signal(5);
  protected readonly seed = signal('');

  protected readonly ratioOptions: RatioOption[] = [
    { label: '16:9', value: '16:9', w: 16, h: 9 },
    { label: '9:16', value: '9:16', w: 9, h: 16 },
    { label: '1:1', value: '1:1', w: 1, h: 1 },
    { label: '4:3', value: '4:3', w: 4, h: 3 },
    { label: '21:9', value: '21:9', w: 21, h: 9 },
  ];
  protected readonly ratioSelectOptions = this.ratioOptions.map((r) => ({ label: r.label, value: r.value }));
  protected readonly resolutionOptions = ['480p', '720p', '1080p'];
  protected readonly refSlotDefs = REF_SLOT_DEFS;
  protected readonly refSlots = signal<Record<RefSlotDef['key'], string | null>>({
    character: null,
    location: null,
    props: null,
  });
  /** Límite de tamaño por imagen de referencia. */
  protected readonly maxRefBytes = 10 * 1024 * 1024;
  protected readonly maxRefLabel = '10 MB';
  protected readonly refError = signal<string | null>(null);
  private refErrorTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Duration range allowed by the selected model. API models declare their
   * supported durations in defaults.durations (e.g. Seedance 2.5 goes up to
   * 60s); downloaded worker models fall back to the 3–10s local range.
   */
  protected readonly durationRange = computed<{ min: number; max: number; step: number }>(() => {
    const durations = this.selectedModel()?.source?.defaults?.durations ?? [];
    const valid = [...new Set(durations.filter((d) => d > 0))].sort((a, b) => a - b);
    if (valid.length === 0) {
      return { min: 3, max: 10, step: 1 };
    }
    return { min: valid[0], max: valid[valid.length - 1], step: 1 };
  });

  /** Human hint under the slider: model-supported span. */
  protected readonly durationHint = computed(() => {
    const { min, max } = this.durationRange();
    const fmt = (s: number) =>
      s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ' ' + (s % 60) + 's' : ''}` : `${s}s`;
    return min === max ? `Solo ${fmt(min)}` : `${fmt(min)} – ${fmt(max)}`;
  });

  // ─── Reference assets ──────────────────────────────────────────
  protected readonly assets = signal<FileAsset[]>([]);
  protected readonly selectedAssetIds = signal<Set<string>>(new Set());
  protected readonly loadingAssets = signal(false);
  protected readonly uploading = signal(false);
  protected readonly showAssetGallery = signal(false);

  // ─── Takes (global generation-events store) ───────────────────
  protected readonly eventsStore = inject(GenerationEventsStore);
  protected readonly takes = this.eventsStore.events;
  protected readonly selectedTakeId = signal<string | null>(null);
  protected readonly selectedTake = computed(
    () => this.takes().find((t) => t.id === this.selectedTakeId()) ?? null,
  );
  protected readonly activeTakes = this.eventsStore.active;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private takeCounter = 0;

  /** Duration popover (slider) anchored to the prompt-foot chip. */
  private readonly durationPopover = viewChild<Popover>('durationPopover');

  protected toggleDurationPopover(event: Event): void {
    this.durationPopover()?.toggle(event);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.refErrorTimer) {
        clearTimeout(this.refErrorTimer);
      }
    });
    // Keep the chosen duration inside the selected model's supported range
    // (e.g. switching from Seedance 2.5 [60s max] to Wan [10s max]).
    effect(() => {
      const { min, max } = this.durationRange();
      const current = this.duration();
      if (current < min) {
        this.duration.set(min);
      } else if (current > max) {
        this.duration.set(max);
      }
    });
    this.loadModels();
    this.loadAssets();
  }

  // ─── Loaders ───────────────────────────────────────────────────
  private loadModels(): void {
    this.loadingModels.set(true);
    this.studioService
      .listModels()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos. ¿Está el backend corriendo?');
          return EMPTY;
        }),
        finalize(() => this.loadingModels.set(false)),
      )
      .subscribe((models) => {
        this.models.set(models);
        // Preselect the lightest downloaded video model for instant play.
        const preferred = models.find(
          (m) => m.modality === 'video' && m.type === 'downloaded' && m.available && m.name.includes('1.3B'),
        );
        if (preferred) {
          this.selectedModel.set(preferred);
        }
      });
  }

  private loadAssets(): void {
    this.loadingAssets.set(true);
    this.libraryService
      .listFiles()
      .pipe(
        catchError(() => EMPTY),
        finalize(() => this.loadingAssets.set(false)),
      )
      .subscribe((files) => this.assets.set(files));
  }

  // ─── Mode & model ──────────────────────────────────────────────
  protected setMode(mode: 'video' | 'image'): void {
    this.mode.set(mode);
    const current = this.selectedModel();
    if (current && current.modality !== mode) {
      this.selectedModel.set(this.modeModels()[0] ?? null);
    }
  }

  protected onModelChange(name: string | null): void {
    const model = this.models().find((m) => m.name === name) ?? null;
    this.selectedModel.set(model);
  }

  protected toggleRatio(value: string): void {
    this.ratio.set(value);
  }

  // ─── Assets ────────────────────────────────────────────────────
  protected toggleAsset(id: string): void {
    const next = new Set(this.selectedAssetIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedAssetIds.set(next);
  }

  /** Muestra el aviso de límite solo en el momento de la violación; se auto-oculta. */
  private flashRefError(message: string): void {
    this.refError.set(message);
    if (this.refErrorTimer) {
      clearTimeout(this.refErrorTimer);
    }
    this.refErrorTimer = setTimeout(() => this.refError.set(null), 5000);
  }

  private clearRefError(): void {
    if (this.refErrorTimer) {
      clearTimeout(this.refErrorTimer);
      this.refErrorTimer = null;
    }
    this.refError.set(null);
  }

  /** Upload a picked image into a typed reference slot (character/location/props). */
  protected onSlotPicked(event: Event, slot: RefSlotDef['key']): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > this.maxRefBytes) {
      this.flashRefError(`"${file.name}" supera el máximo de ${this.maxRefLabel} por referencia.`);
      input.value = '';
      return;
    }
    this.clearRefError();
    this.uploading.set(true);
    this.libraryService
      .uploadFile(file)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo subir el archivo.');
          return EMPTY;
        }),
        finalize(() => {
          this.uploading.set(false);
          input.value = '';
        }),
      )
      .subscribe((asset) => {
        this.assets.update((list) => [asset, ...list]);
        this.refSlots.update((slots) => ({ ...slots, [slot]: asset.id }));
        if (!this.selectedAssetIds().has(asset.id)) {
          this.toggleAsset(asset.id);
        }
      });
  }

  /** Library URL for a slot thumbnail; falls back to a placeholder frame. */
  protected assetThumbUrl(assetId: string): string {
    const asset = this.assets().find((a) => a.id === assetId);
    if (!asset?.url) {
      return '';
    }
    const url = asset.url;
    const origin = environment.apiUrl.replace(/\/api\/v1\/?$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return /^https?:\/\//i.test(url) ? url : `${origin}${path}`;
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > this.maxRefBytes) {
      this.flashRefError(`"${file.name}" supera el máximo de ${this.maxRefLabel} por referencia.`);
      input.value = '';
      return;
    }
    this.clearRefError();
    this.uploading.set(true);
    this.libraryService
      .uploadFile(file)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo subir el archivo.');
          return EMPTY;
        }),
        finalize(() => {
          this.uploading.set(false);
          input.value = '';
        }),
      )
      .subscribe((asset) => {
        this.assets.update((list) => [asset, ...list]);
        this.toggleAsset(asset.id);
      });
  }

  // ─── Generate ──────────────────────────────────────────────────
  protected canGenerate(): boolean {
    return (
      !!this.selectedModel() &&
      this.prompt().trim().length > 0 &&
      !this.submitting()
    );
  }

  protected generate(): void {
    const model = this.selectedModel();
    const text = this.prompt().trim();
    if (!model || !text || this.submitting()) {
      return;
    }
    this.error.set(null);
    this.submitting.set(true);

    const ratio = this.ratio();
    const duration = this.mode() === 'video' ? this.duration() : 0;
    const takeId = `pending_${Date.now()}`;
    const take: StudioTake = {
      id: takeId,
      prompt: text,
      modelName: model.name,
      modelDisplayName: model.displayName,
      modelType: model.type,
      ratio,
      resolution: this.resolution(),
      duration,
      status: 'queued',
      progress: 0,
      videoUrl: null,
      error: null,
      createdAt: Date.now(),
    };
    this.eventsStore.upsert(take);
    this.selectedTakeId.set(takeId);

    this.studioService
      .ensureTakeSlot(`Studio ${new Date().toLocaleDateString()}`, this.takeCode())
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto Studio.');
          this.submitting.set(false);
          this.eventsStore.patch(takeId, { status: 'failed', error: 'no slot' });
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        const payload = {
          model: model.name,
          content: [{ type: 'text' as const, text }],
          ratio,
          duration: duration || undefined,
          resolution: this.resolution(),
          seed: this.seed().trim() || undefined,
          event_id: project.id,
          program_id: undefined,
          piece_id: piece.id,
          piece_code: piece.piece_code ?? piece.id,
          generation_number: ++this.takeCounter,
        };
        this.agencyService
          .generate(this.mode(), payload)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo iniciar la generación.');
              this.submitting.set(false);
              this.eventsStore.patch(takeId, { status: 'failed', error: 'submit error' });
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.eventsStore.patch(takeId, { id: response.taskId });
            this.eventsStore.track(response.taskId);
            this.selectedTakeId.set(response.taskId);
            this.submitting.set(false);
          });
      });
  }

  // ─── Take list helpers ─────────────────────────────────────────
  protected selectTake(take: StudioTake): void {
    this.selectedTakeId.set(take.id);
  }

  protected cancelTake(take: StudioTake): void {
    this.eventsStore.cancel(take.id);
  }

  private takeCode(): string {
    const stamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `STU-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
  }

  protected takeStatusSeverity(status: StudioTake['status']): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'info';
      case 'cancelled':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  protected takeStatusLabel(status: StudioTake['status']): string {
    const labels: Record<StudioTake['status'], string> = {
      queued: 'En cola',
      running: 'Generando',
      succeeded: 'Listo',
      failed: 'Error',
      cancelled: 'Cancelado',
    };
    return labels[status];
  }

  protected formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
