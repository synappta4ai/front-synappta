import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
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
  LOCATION_DEFAULT_RATIO,
  LOCATION_DEFAULT_RESOLUTION,
  LOCATION_DEFAULT_VIEW,
  LOCATION_PIECE_CODE,
  LOCATION_RATIO_OPTIONS,
  LOCATION_RESOLUTION_PREFERENCE,
  LOCATION_RESOLUTIONS_FALLBACK,
  LOCATION_VIEWS,
  LocationRatioOption,
  LocationView,
} from '../../interfaces';
import { PoseSheetAnchor, ToolsService } from '../../services';

const REF_MAX_BYTES = 10 * 1024 * 1024;
const REF_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

/**
 * Locación (Herramientas): genera con Soul 2 o Nano Banana Pro una vista de
 * cámara del lugar —desde referencias subidas o solo texto— y la guarda en
 * Recursos como ingrediente location para usarla de contexto en video.
 */
@Component({
  selector: 'app-location',
  imports: [FormsModule, TranslatePipe, Button, Message, Select, Tag, ServerUrlPipe, UiIcon],
  templateUrl: './location.component.html',
  styleUrl: './location.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationComponent implements OnInit {
  private readonly toolsService = inject(ToolsService);
  private readonly libraryService = inject(LibraryService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly views = LOCATION_VIEWS;

  protected readonly models = signal<AiModel[]>([]);
  protected readonly loadingModels = signal(true);
  protected readonly selectedModel = signal('');
  protected readonly activeModel = computed(
    () => this.models().find((m) => m.name === this.selectedModel()) ?? null,
  );
  /** Soul 2 es texto puro: avisa si hay referencias que el modelo ignorará. */
  protected readonly soulSelected = computed(() =>
    (this.activeModel()?.name ?? '').toLowerCase().includes('soul'),
  );

  protected readonly view = signal<LocationView>(LOCATION_DEFAULT_VIEW);

  /** Formato de salida: el usuario puede cambiarlo; el default es 16:9 / 2K. */
  protected readonly ratio = signal<string>(LOCATION_DEFAULT_RATIO);
  protected readonly resolution = signal<string>(LOCATION_DEFAULT_RESOLUTION);

  protected readonly ratioOptions = LOCATION_RATIO_OPTIONS;

  /** Ratios que declara el modelo elegido (null = sin restricción). */
  protected readonly allowedRatios = computed<readonly string[] | null>(() => {
    const ratios = this.activeModel()?.defaults?.ratios;
    return ratios && ratios.length > 0 ? ratios : null;
  });

  /** Opciones del desplegable de relación de aspecto, filtradas por modelo. */
  protected readonly visibleRatioOptions = computed<LocationRatioOption[]>(() => {
    const allowed = this.allowedRatios();
    return allowed
      ? this.ratioOptions.filter((r) => allowed.includes(r.value))
      : [...this.ratioOptions];
  });

  /** Resoluciones que declara el modelo elegido (fallback 1K/2K/4K). */
  protected readonly resolutionOptions = computed<string[]>(() => {
    const res = this.activeModel()?.defaults?.resolutions;
    return res && res.length > 0 ? [...res] : [...LOCATION_RESOLUTIONS_FALLBACK];
  });

  /**
   * Al cambiar de modelo ajusta ratio/resolución a valores soportados: cae a la
   * relación horizontal más ancha disponible (p. ej. Gemini sin 16:9 → 3:2) y
   * a 2K cuando el modelo lo ofrece.
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

  protected readonly defaultPrompt = signal('');
  protected readonly editedPrompt = signal('');
  protected readonly loadingPrompt = signal(false);
  protected readonly promptDirty = computed(() => this.editedPrompt() !== this.defaultPrompt());

  protected readonly locationName = signal('');
  protected readonly locationDesc = signal('');

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
      .listLocationModels()
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
    this.loadPrompt();
  }

  protected onViewChange(view: LocationView): void {
    if (view === this.view()) {
      return;
    }
    this.view.set(view);
  }

  /** Cambio de ratio: ignora valores no soportados por el modelo elegido. */
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
    this.generating.set(true);
    this.progress.set(null);
    this.error.set(null);
    this.result.set([]);
    this.savedName.set(null);
    this.toolsService
      .ensureLocationAnchor(this.translate.instant('TOOLS.ANCHOR_LOCATION'))
      .pipe(
        mergeMap((anchor) => {
          this.anchor = anchor;
          return this.toolsService.generateLocation({
            model,
            prompt,
            ratio: this.ratio(),
            resolution: this.resolution(),
            referenceIds: this.refs().map((r) => ({ id: r.id, name: r.filename })),
            eventId: anchor.project.id,
            pieceId: anchor.piece.id,
            pieceCode: LOCATION_PIECE_CODE,
          });
        }),
        mergeMap((gen) => this.toolsService.trackLocation(gen.taskId)),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.generating.set(false)),
      )
      .subscribe({
        next: (status) => {
          if (typeof status.progress_percent === 'number') {
            this.progress.set(status.progress_percent);
          }
          if (status.status === 'succeeded' || status.status === 'completed') {
            const outputs = status.outputs ?? [];
            this.result.set(outputs);
            // Guardado automático en Recursos como locación; el botón
            // manual queda como reintento si el auto-guardado falla.
            if (outputs[0]?.url && !this.savedName() && !this.saving()) {
              this.saveAsLocation();
            }
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            this.error.set(status.error ?? status.status);
          }
        },
        error: (err: unknown) => this.error.set(err instanceof Error ? err.message : String(err)),
      });
  }

  protected saveAsLocation(): void {
    const output = this.result()[0];
    const anchor = this.anchor;
    if (!output?.url || !anchor || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const fallback = `Location ${new Date().toLocaleDateString()}`;
    this.toolsService
      .saveLocationAsIngredient({
        outputUrl: output.url,
        name: this.locationName().trim() || fallback,
        description: this.locationDesc().trim() || undefined,
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

  private loadPrompt(): void {
    this.loadingPrompt.set(true);
    this.toolsService
      .loadLocationPrompt()
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

  private viewInstruction(): string {
    const view = LOCATION_VIEWS.find((v) => v.key === this.view());
    return view ? this.translate.instant(view.instructionKey) : '';
  }

  private composePrompt(): string {
    const parts = [this.editedPrompt().trim()];
    const instruction = this.viewInstruction().trim();
    if (instruction) {
      parts.push(instruction);
    }
    const name = this.locationName().trim();
    const desc = this.locationDesc().trim();
    const who = [name, desc].filter(Boolean).join(' — ');
    if (who) {
      parts.push(`Location: ${who}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }
}
