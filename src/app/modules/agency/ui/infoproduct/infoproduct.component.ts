import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, forkJoin, map, of } from 'rxjs';

import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { Steps } from 'primeng/steps';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

import {
  AiModel,
  ComposeTarget,
  DcsAnalyze,
  GenerateRequest,
  IngredientRole,
  VideoAnalysis,
  VideoBreakdown,
  VideoFormat,
  VideoPrompt,
} from '@modules/agency/interfaces';
import { InfoproductService, ModelCatalogService } from '@modules/agency/services';
import { GenerationQueueService } from '@services/generation-queue.service';
import { FileAsset } from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { ModelSelectComponent } from '../model-select/model-select.component';
import {
  Attachment,
  attachmentKind,
  buildImageRoles,
  buildTarget,
  dcsShotRowsByIndex,
  dcsTechGroups,
  promptForGeneration,
  snapDuration,
  TechRow,
} from './infoproduct-helpers';

type Step = 1 | 2 | 3;

const FALLBACK_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];
const DEFAULT_VIDEO_MODEL = 'higgsfield-seedance-2-5-reference';
const FALLBACK_RESOLUTIONS = ['480p', '720p', '1080p'];

/**
 * VideoMachine · agente "Infoproducto": copia un video de referencia.
 * 1) el cerebro multimodal desglosa el video (archivo o URL), 2) el usuario
 * revisa el desglose y adjunta imágenes del producto (y audio), 3) el cerebro
 * entrega el prompt completo y los ajustes para generar en una sola toma
 * (o en varias si el video supera el máximo del modelo).
 */
@Component({
  selector: 'app-infoproduct',
  imports: [
    FormsModule,
    TranslatePipe,
    Button,
    Card,
    InputText,
    Message,
    ProgressBar,
    Select,
    Steps,
    Tag,
    Textarea,
    ToggleSwitch,
    Tooltip,
    ModelSelectComponent,
  ],
  templateUrl: './infoproduct.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoproductComponent implements OnDestroy {
  private readonly infoproduct = inject(InfoproductService);
  private readonly library = inject(LibraryService);
  private readonly catalog = inject(ModelCatalogService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly generationQueue = inject(GenerationQueueService);

  protected readonly step = signal<Step>(1);
  protected readonly error = signal<string | null>(null);

  protected readonly stepItems = computed<MenuItem[]>(() => {
    const keys = ['VIDEOMACHINE.STEP_SOURCE', 'VIDEOMACHINE.STEP_BREAKDOWN', 'VIDEOMACHINE.STEP_PROMPT'];
    return keys.map((key, i) => ({
      label: this.translate.instant(key),
      command: () => this.goTo((i + 1) as Step),
      disabled: i === 1 ? !this.analysis() && !this.useFormat() : i === 2 ? !this.result() : false,
    }));
  });

  // ── Paso 1: fuente ──────────────────────────────────────────────
  /** false = "Video de referencia → video final"; true = "Formato → video final". */
  protected readonly useFormat = signal(false);
  protected readonly formats = signal<readonly VideoFormat[]>([]);
  protected readonly formatId = signal<string | null>(null);
  /** El switch solo se habilita cuando existe al menos un formato activo. */
  protected readonly formatsAvailable = computed(() => this.formats().length > 0);

  protected readonly videoFile = signal<File | null>(null);
  protected readonly videoUrl = signal('');
  protected readonly brainModel = signal('');
  protected readonly analyzing = signal(false);
  protected readonly analyzeSeconds = signal(0);
  protected readonly analysis = signal<VideoAnalysis | null>(null);
  private analyzeTimer: ReturnType<typeof setInterval> | null = null;

  /** Cerebro: LLMs de texto que leen video (si no hay, todos los de texto). */
  private readonly textModels = toSignal(this.catalog.byModality('text').pipe(catchError(() => of([] as AiModel[]))), {
    initialValue: [] as AiModel[],
  });
  protected readonly brainNames = computed<readonly string[] | null>(() => {
    const names = this.textModels()
      .filter((m) => (m.input_modalities ?? []).includes('video'))
      .map((m) => m.name);
    return names.length > 0 ? names : null;
  });

  protected readonly canAnalyze = computed(() => {
    if (this.analyzing()) return false;
    return !!this.videoFile() || this.videoUrl().trim().length > 0;
  });

  // ── Paso 2: desglose + insumos ──────────────────────────────────
  protected readonly notes = signal('');
  protected readonly attachments = signal<readonly Attachment[]>([]);
  protected readonly uploading = signal(false);
  protected readonly videoModel = signal<AiModel | null>(null);
  protected readonly composing = signal(false);
  protected readonly composeSeconds = signal(0);
  private composeTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly images = computed(() => this.attachments().filter((a) => a.kind === 'image'));
  protected readonly audios = computed(() => this.attachments().filter((a) => a.kind === 'audio'));
  protected readonly videos = computed(() => this.attachments().filter((a) => a.kind === 'video'));
  protected readonly breakdown = computed<VideoBreakdown | null>(() => this.analysis()?.breakdown ?? null);

  // ── Ficha técnica (skill DCS-ANALYZE; vacía en análisis viejos) ──
  protected readonly dcs = computed<DcsAnalyze | null>(() => this.breakdown()?.dcs_analyze ?? null);
  protected readonly techGroups = computed(() =>
    dcsTechGroups(this.dcs(), (key) => this.translate.instant(key)),
  );
  protected readonly techWarning = computed(() =>
    this.dcs()?.quality?.checks_passed === false
      ? this.translate.instant('VIDEOMACHINE.TECH_CHECKS_PENDING')
      : null,
  );
  private readonly shotDetails = computed(() =>
    dcsShotRowsByIndex(this.dcs(), (key) => this.translate.instant(key)),
  );
  protected readonly expandedShots = signal<ReadonlySet<number>>(new Set<number>());

  protected isShotExpanded(index: number): boolean {
    return this.expandedShots().has(index);
  }

  protected toggleShot(index: number): void {
    this.expandedShots.update((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }

  protected shotRows(index: number): readonly TechRow[] {
    return this.shotDetails().get(index) ?? [];
  }
  protected readonly canCompose = computed(
    () =>
      !this.composing() &&
      !this.uploading() &&
      this.images().length > 0 &&
      !!this.videoModel() &&
      (this.useFormat() ? !!this.formatId() : !!this.analysis()),
  );
  protected readonly roleOptions = computed(() => [
    { label: this.translate.instant('VIDEOMACHINE.ROLE_PRODUCT'), value: 'product' as IngredientRole },
    { label: this.translate.instant('VIDEOMACHINE.ROLE_PERSON'), value: 'person' as IngredientRole },
  ]);

  // ── Paso 3: prompt + generación ─────────────────────────────────
  protected readonly result = signal<VideoPrompt | null>(null);
  protected readonly segmentPrompts = signal<readonly string[]>([]);
  protected readonly segmentDurations = signal<readonly number[]>([]);
  protected readonly ratio = signal('');
  protected readonly resolution = signal('');
  protected readonly audio = signal(false);
  protected readonly launched = signal<ReadonlySet<number>>(new Set());
  /** Generaciones ya enviadas a la cola. */
  protected readonly queued = signal<ReadonlySet<number>>(new Set<number>());

  protected readonly ratioOptions = computed(() =>
    (this.videoModel()?.defaults?.ratios?.length ? this.videoModel()!.defaults.ratios! : FALLBACK_RATIOS).map(
      (r) => ({ label: r, value: r }),
    ),
  );
  protected readonly resolutionOptions = computed(() =>
    (this.videoModel()?.defaults?.resolutions?.length
      ? this.videoModel()!.defaults.resolutions!
      : FALLBACK_RESOLUTIONS
    ).map((r) => ({ label: r, value: r })),
  );
  protected readonly formatOptions = computed(() =>
    this.formats().map((f) => ({ label: f.label, value: f.id })),
  );
  protected readonly supportsAudio = computed(() => {
    const model = this.videoModel();
    return model ? buildTarget(model).supports_audio : false;
  });

  constructor() {
    this.infoproduct
      .listFormats()
      .pipe(catchError(() => of([] as VideoFormat[])))
      .subscribe((formats) => this.formats.set(formats));
    // Modelo por defecto: Seedance 2.5 (Higgsfield) con ingredientes de
    // imagen y audio, para que fondos poco aptos no confundan al generador.
    this.catalog
      .byModality('video')
      .pipe(catchError(() => of([] as AiModel[])))
      .subscribe((models) => {
        if (this.videoModel()) return;
        const preferred = models.find((m) => m.name === DEFAULT_VIDEO_MODEL);
        if (preferred) this.onVideoModelChange(preferred);
      });
  }

  ngOnDestroy(): void {
    this.stopProgress('analyze');
    this.stopProgress('compose');
  }

  /** Contador de segundos para las barras de progreso de cada paso. */
  private startProgress(kind: 'analyze' | 'compose'): void {
    this.stopProgress(kind);
    const target = kind === 'analyze' ? this.analyzeSeconds : this.composeSeconds;
    target.set(0);
    const timer = setInterval(() => target.update((seconds) => seconds + 1), 1000);
    if (kind === 'analyze') {
      this.analyzeTimer = timer;
    } else {
      this.composeTimer = timer;
    }
  }

  private stopProgress(kind: 'analyze' | 'compose'): void {
    if (kind === 'analyze') {
      if (this.analyzeTimer !== null) clearInterval(this.analyzeTimer);
      this.analyzeTimer = null;
      return;
    }
    if (this.composeTimer !== null) clearInterval(this.composeTimer);
    this.composeTimer = null;
  }

  private finishAnalyze(): void {
    this.analyzing.set(false);
    this.stopProgress('analyze');
  }

  private finishCompose(): void {
    this.composing.set(false);
    this.stopProgress('compose');
  }

  // ── Paso 1 ──────────────────────────────────────────────────────
  protected onVideoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.videoFile.set(file);
    this.videoUrl.set('');
  }

  protected onUrlInput(value: string): void {
    this.videoUrl.set(value);
    if (value.trim()) this.videoFile.set(null);
  }

  protected clearVideoFile(): void {
    this.videoFile.set(null);
  }

  protected toggleFormat(on: boolean): void {
    if (on && !this.formatsAvailable()) return;
    this.useFormat.set(on);
    this.error.set(null);
  }

  /** Sin video de referencia: el flujo salta directo a los insumos con el formato. */
  protected continueWithFormat(): void {
    if (!this.formatId()) return;
    this.analysis.set(null);
    this.step.set(2);
  }

  protected analyze(): void {
    if (!this.canAnalyze()) return;
    this.error.set(null);
    this.analyzing.set(true);
    this.startProgress('analyze');
    const file = this.videoFile();
    const model = this.brainModel() || undefined;

    const request$ = file
      ? this.library.uploadFile(file, 'videos', undefined, undefined, 'temp')
      : of(null as FileAsset | null);

    request$
      .pipe(
        catchError((err: unknown) => {
          this.fail(err, 'VIDEOMACHINE.ERR_UPLOAD');
          this.finishAnalyze();
          return EMPTY;
        }),
      )
      .subscribe((uploaded) => {
        this.infoproduct
          .analyze(uploaded ? { file_id: uploaded.id, model } : { url: this.videoUrl().trim(), model })
          .pipe(
            catchError((err: unknown) => {
              this.fail(err, 'VIDEOMACHINE.ERR_ANALYZE');
              return EMPTY;
            }),
            finalize(() => this.finishAnalyze()),
          )
          .subscribe((analysis) => {
            this.analysis.set(analysis);
            this.videoFile.set(null);
            this.step.set(2);
          });
      });
  }

  // ── Paso 2 ──────────────────────────────────────────────────────
  protected onInputsPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.error.set(null);
    this.uploading.set(true);
    const uploads = files.map((file) => {
      const kind = attachmentKind(file);
      if (!kind) {
        this.error.set(this.translate.instant('VIDEOMACHINE.ERR_INPUT_TYPE', { name: file.name }));
        return of(null);
      }
      return this.library
        .uploadFile(file, kind === 'audio' ? 'audio' : kind === 'video' ? 'videos' : 'images')
        .pipe(
        map(
          (asset): Attachment => ({
            id: asset.id,
            name: file.name,
            kind,
            url: asset.thumbnail_url || asset.url || '',
            role: kind === 'image' ? 'product' : undefined,
          }),
        ),
        catchError((err: unknown) => {
          this.fail(err, 'VIDEOMACHINE.ERR_UPLOAD');
          return of(null);
        }),
      );
    });
    forkJoin(uploads)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe((items) => {
        const added = items.filter((i): i is Attachment => !!i);
        if (added.length) this.attachments.update((list) => [...list, ...added]);
      });
  }

  protected removeAttachment(id: string): void {
    this.attachments.update((list) => list.filter((a) => a.id !== id));
  }

  protected setAttachmentRole(id: string, role: IngredientRole): void {
    this.attachments.update((list) =>
      list.map((a) => (a.id === id ? { ...a, role: role === 'person' ? 'person' : 'product' } : a)),
    );
  }

  protected onVideoModelChange(model: AiModel | null): void {
    this.videoModel.set(model);
    if (!model) return;
    // Ajustes por defecto del modelo; un resultado ya compuesto se corrige a sus límites.
    const target = buildTarget(model);
    if (this.result()) {
      this.ratio.set(target.ratios.includes(this.ratio()) ? this.ratio() : (target.ratios[0] ?? this.ratio()));
      this.resolution.set(
        target.resolutions.includes(this.resolution()) ? this.resolution() : (target.resolutions[0] ?? this.resolution()),
      );
      if (!target.supports_audio) this.audio.set(false);
    }
  }

  protected compose(): void {
    const model = this.videoModel();
    if (!model || !this.canCompose()) return;
    this.error.set(null);
    this.composing.set(true);
    this.startProgress('compose');
    const target: ComposeTarget = buildTarget(model);
    this.infoproduct
      .compose({
        breakdown: this.analysis()?.breakdown ?? {},
        model: this.brainModel() || undefined,
        target,
        target_model: target.model,
        image_file_ids: this.images().map((a) => a.id),
        audio_file_ids: this.audios().map((a) => a.id),
        video_file_ids: this.videos().map((a) => a.id),
        image_roles: buildImageRoles(this.attachments()),
        fps: this.analysis()?.meta.fps,
        aspect_ratio: this.analysis()?.meta.aspect_ratio,
        notes: this.notes().trim() || undefined,
        format_id: this.useFormat() ? (this.formatId() ?? undefined) : undefined,
      })
      .pipe(
        catchError((err: unknown) => {
          this.fail(err, 'VIDEOMACHINE.ERR_COMPOSE');
          return EMPTY;
        }),
        finalize(() => this.finishCompose()),
      )
      .subscribe((response) => {
        const vp = response.video_prompt;
        this.result.set(vp);
        this.segmentPrompts.set(vp.segments.map((s) => s.prompt));
        this.segmentDurations.set(
          vp.segments.map((s) =>
            snapDuration(Math.round(s.end - s.start) || vp.duration, target.durations, target.max_duration),
          ),
        );
        this.ratio.set(vp.ratio);
        this.resolution.set(vp.resolution);
        this.audio.set(vp.generate_audio);
        this.launched.set(new Set());
        this.step.set(3);
      });
  }

  // ── Paso 3 ──────────────────────────────────────────────────────
  protected setSegmentPrompt(index: number, value: string): void {
    this.segmentPrompts.update((list) => list.map((p, i) => (i === index ? value : p)));
  }

  protected setSegmentDuration(index: number, value: number | string | null): void {
    const n = Math.max(1, Math.round(Number(value) || 1));
    this.segmentDurations.update((list) => list.map((d, i) => (i === index ? n : d)));
  }

  protected ingredientThumb(fileId: string): string {
    return this.attachments().find((a) => a.id === fileId)?.url ?? '';
  }

  protected generateSegment(index: number): void {
    this.launch([index]);
  }

  protected generateAll(): void {
    const count = this.result()?.segments.length ?? 0;
    this.launch(Array.from({ length: count }, (_, i) => i));
  }

  /**
   * Arma los requests y va directo al Estudio: ahí quedan cargados prompt e
   * insumos (imágenes y audio) y la generación arranca de inmediato; si algo
   * falla se repite desde el mismo panel sin volver a subir nada.
   */
  private launch(indexes: number[]): void {
    const vp = this.result();
    const model = this.videoModel();
    if (!vp || !model || indexes.length === 0) return;
    this.error.set(null);

    const code = this.takeCode();
    const useAudio = buildTarget(model).audio_reference;
    const payloads = indexes.map((index) => {
      const text = promptForGeneration(this.segmentPrompts()[index] ?? '');
      const content: GenerateRequest['content'] = [
        ...vp.ingredients.map((ing) => ({
          type: 'image' as const,
          id: ing.file_id,
          name: this.attachments().find((a) => a.id === ing.file_id)?.name,
        })),
        ...(useAudio
          ? vp.audio_refs.map((ref) => ({
              type: 'audio' as const,
              id: ref.file_id,
              name: this.attachments().find((a) => a.id === ref.file_id)?.name,
            }))
          : []),
        ...(vp.video_refs ?? []).map((ref) => ({
          type: 'video' as const,
          id: ref.file_id,
          name: this.attachments().find((a) => a.id === ref.file_id)?.name ?? ref.name,
        })),
        { type: 'text' as const, text },
      ];
      const payload: GenerateRequest = {
        model: model.name,
        content,
        ratio: this.ratio(),
        duration: this.segmentDurations()[index] ?? vp.duration,
        resolution: this.resolution(),
        generate_audio: this.supportsAudio() ? this.audio() : undefined,
        // El Estudio resuelve proyecto/pieza al encolar.
        event_id: '',
        piece_id: '',
        piece_code: code,
        generation_number: 0,
      };
      return payload;
    });

    this.launched.update((set) => new Set([...set, ...indexes]));
    sessionStorage.setItem('studio:reuse', JSON.stringify(payloads[0]));
    sessionStorage.setItem('studio:autostart', JSON.stringify(payloads));
    void this.router.navigate(['/studio']);
  }

  /** Encola una de las generaciones del resultado para lanzarla desde el Estudio. */
  protected enqueueSegment(index: number): void {
    const vp = this.result();
    const model = this.videoModel();
    const prompt = this.segmentPrompts()[index] ?? '';
    if (!vp || !model || !prompt.trim()) return;
    const assets = [
      ...vp.ingredients.map((ingredient) => ({
        id: ingredient.file_id,
        name: this.attachments().find((a) => a.id === ingredient.file_id)?.name ?? ingredient.tag,
        kind: 'image' as const,
      })),
      ...vp.audio_refs.map((ref) => ({
        id: ref.file_id,
        name: this.attachments().find((a) => a.id === ref.file_id)?.name ?? ref.tag,
        kind: 'audio' as const,
      })),
    ];
    this.generationQueue.add([
      {
        label: this.translate.instant('VIDEOMACHINE.QUEUE_SEGMENT_LABEL', { n: index + 1 }),
        source: 'infoproduct',
        prompt,
        assets,
        model: model.name,
        modelDisplayName: model.display_name || model.name,
        ratio: this.ratio(),
        duration: this.segmentDurations()[index] ?? vp.duration,
        resolution: this.resolution(),
        generateAudio: this.supportsAudio() ? this.audio() : false,
      },
    ]);
    this.queued.update((set) => new Set([...set, index]));
  }
  protected goTo(step: Step): void {
    if (step === 2 && !this.analysis() && !this.useFormat()) return;
    if (step === 3 && !this.result()) return;
    this.step.set(step);
  }

  protected restart(): void {
    this.step.set(1);
    this.analysis.set(null);
    this.result.set(null);
    this.attachments.set([]);
    this.notes.set('');
    this.videoFile.set(null);
    this.videoUrl.set('');
    this.error.set(null);
  }

  private takeCode(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `VM-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /** Muestra el mensaje del back si lo hay; si no, el texto genérico de la clave. */
  private fail(err: unknown, fallbackKey: string): void {
    let message = '';
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string } | null;
      message = body?.message ?? '';
    } else if (err instanceof Error) {
      message = err.message;
    }
    this.error.set(message || this.translate.instant(fallbackKey));
  }
}
