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
import { Observable, defer, finalize, forkJoin, from, of } from 'rxjs';
import { catchError, concatMap, map, mergeMap, tap } from 'rxjs/operators';

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
  LocationViewDef,
  TOOLS_LOADING_POSTER,
  TOOLS_LOADING_VIDEO,
} from '../../interfaces';
import { PoseSheetAnchor, ToolsService } from '../../services';

const REF_MAX_BYTES = 10 * 1024 * 1024;
const REF_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
const MIN_LOADING_MS = 650;
const PROGRESS_EXPECTED_MS = 75_000;

/** Una vista generada: el output del back y la vista a la que corresponde. */
interface LocationViewResult {
  output: StatusOutput;
  viewLabel: string;
}

/**
 * Locación (Herramientas): genera con Gemini 3 Pro Image una vista de cámara
 * del lugar —desde referencias subidas o solo texto— y la guarda en Recursos
 * como ingrediente location para usarla de contexto en video.
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
    this.destroyRef.onDestroy(() => this.stopProgressRamp());
  }

  protected readonly views = LOCATION_VIEWS;
  protected readonly loadingVideo = TOOLS_LOADING_VIDEO;
  protected readonly loadingPoster = TOOLS_LOADING_POSTER;

  protected readonly models = signal<AiModel[]>([]);
  protected readonly loadingModels = signal(true);
  protected readonly selectedModel = signal('');
  protected readonly activeModel = computed(
    () => this.models().find((m) => m.name === this.selectedModel()) ?? null,
  );

  protected readonly selectedViews = signal<readonly LocationView[]>([LOCATION_DEFAULT_VIEW]);

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
  protected readonly totalViews = signal(0);
  protected readonly currentView = signal(1);
  protected readonly failedViews = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly results = signal<readonly LocationViewResult[]>([]);

  private progressTimer: ReturnType<typeof setInterval> | null = null;
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

  protected isViewSelected(view: LocationView): boolean {
    return this.selectedViews().includes(view);
  }

  /** Alterna una vista de cámara; siempre queda al menos una seleccionada. */
  protected toggleView(view: LocationView): void {
    const current = this.selectedViews();
    if (current.includes(view)) {
      if (current.length > 1) {
        this.selectedViews.set(current.filter((v) => v !== view));
      }
      return;
    }
    this.selectedViews.set([...current, view]);
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
    const views = this.selectedViews();
    if (!model || views.length === 0 || this.generating()) {
      return;
    }
    const startedAt = Date.now();
    this.generating.set(true);
    this.progress.set(null);
    this.startProgressRamp();
    this.error.set(null);
    this.results.set([]);
    this.savedName.set(null);
    this.failedViews.set(0);
    this.totalViews.set(views.length);
    this.currentView.set(1);
    this.toolsService
      .ensureLocationAnchor(this.translate.instant('TOOLS.ANCHOR_LOCATION'))
      .pipe(
        mergeMap((anchor) => {
          this.anchor = anchor;
          // Una generación por vista, en serie: el modelo de imagen es
          // sincrónico (cada POST bloquea hasta devolver la imagen).
          return from(views).pipe(
            concatMap((view, index) => this.generateView(view, index, model, anchor)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.finishLoading(startedAt)),
      )
      .subscribe({
        complete: () => this.saveResults(),
        error: (err: unknown) => this.error.set(err instanceof Error ? err.message : String(err)),
      });
  }

  /**
   * Genera una vista. Si falla, se registra y la cola sigue con la siguiente
   * (así las vistas que sí salieron se guardan igual).
   */
  private generateView(
    view: LocationView,
    index: number,
    model: string,
    anchor: PoseSheetAnchor,
  ): Observable<void> {
    return defer(() => {
      this.currentView.set(index + 1);
      this.startProgressRamp();
      const viewLabel = this.translate.instant(this.viewDef(view).labelKey);
      return this.toolsService
        .generateLocation({
          model,
          prompt: this.composePrompt(view),
          ratio: this.ratio(),
          resolution: this.resolution(),
          referenceIds: this.refs().map((r) => ({ id: r.id, name: r.filename })),
          eventId: anchor.project.id,
          pieceId: anchor.piece.id,
          pieceCode: LOCATION_PIECE_CODE,
        })
        .pipe(
          tap((gen) => this.applyOutput(gen.outputs ?? [], viewLabel)),
          map(() => undefined),
          catchError((err: unknown) => {
            this.failedViews.update((n) => n + 1);
            this.error.set(err instanceof Error ? err.message : String(err));
            return of(undefined);
          }),
        );
    });
  }

  private applyOutput(outputs: readonly StatusOutput[], viewLabel: string): void {
    if (outputs.length === 0) {
      return;
    }
    this.results.update((list) => [...list, ...outputs.map((output) => ({ output, viewLabel }))]);
  }

  /**
   * Los modelos de imagen no reportan progreso incremental (el back solo lo
   * estima para video), así que avanzamos el porcentaje en el cliente hasta
   * acercarse al 95%; el 100 solo lo confirma el estado terminal.
   */
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
    this.progress.set(100);
    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
    if (wait === 0) {
      this.generating.set(false);
      return;
    }
    setTimeout(() => this.generating.set(false), wait);
  }

  /**
   * Guarda todas las vistas generadas en un mismo recurso de locación. No se
   * cancela al desmontar el componente: si el usuario navega mientras sube,
   * el recurso quedaría creado a medias.
   */
  protected saveResults(): void {
    const anchor = this.anchor;
    const photos = this.results();
    if (!anchor || photos.length === 0 || this.savedName() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const fallback = `Location ${new Date().toLocaleDateString()}`;
    this.toolsService
      .saveLocationViewsAsIngredient({
        name: this.locationName().trim() || fallback,
        description: this.locationDesc().trim() || undefined,
        eventId: anchor.project.id,
        photos: photos.map((p) => ({ outputUrl: p.output.url, viewLabel: p.viewLabel })),
      })
      .pipe(finalize(() => this.saving.set(false)))
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

  private viewDef(view: LocationView): LocationViewDef {
    return LOCATION_VIEWS.find((v) => v.key === view) ?? LOCATION_VIEWS[0];
  }

  private composePrompt(view: LocationView): string {
    const parts = [this.editedPrompt().trim()];
    const instruction = this.translate.instant(this.viewDef(view).instructionKey).trim();
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
