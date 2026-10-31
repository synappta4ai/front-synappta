import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, firstValueFrom, forkJoin, map, of } from 'rxjs';

import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Select } from 'primeng/select';
import { Steps } from 'primeng/steps';
import { Textarea } from 'primeng/textarea';

import {
  AiModel,
  WritingCopilotHistoryMessage,
  WritingCopilotParams,
  WritingCopilotTurn,
} from '@modules/agency/interfaces';
import { AgencyService, ModelCatalogService, WritingCopilotService } from '@modules/agency/services';
import { GenerationQueueService } from '@services/generation-queue.service';
import { LibraryService } from '@modules/library/services';
import { highlightPrompt, PromptSegment } from '../agency/agency-prompt-highlight';
import { attachmentKind, Attachment } from '../infoproduct/infoproduct-helpers';
import {
  buildReferences,
  CopilotAsset,
  CopilotAssetRole,
  FINAL_PROMPT_INSTRUCTION,
  promptKinds,
  splitFences,
  tagAssets,
  WritingSegment,
} from './writing-copilot-helpers';

type Step = 1 | 2 | 3;
type Delivery = 'sequence' | 'shot_pack' | 'auto';
type AudioMode = 'auto' | 'diegetic_only' | 'with_dialogue' | 'with_music_notes' | 'silent';

const DEFAULT_VIDEO_MODEL = 'higgsfield-seedance-2-5-reference';
const PREFERRED_BRAIN = 'google/gemini-3.8-flash';

/**
 * VideoMachine · agente "Writing Copilot": convierte una idea, un guion o una
 * historia corta en prompts cinematográficos (planos, cámara, lentes, luz,
 * actuación, diálogo) y entrega el prompt final en inglés con los insumos
 * tagueados con el sistema de colores de la app.
 */
@Component({
  selector: 'app-writing-copilot',
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
    Textarea,
  ],
  templateUrl: './writing-copilot.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WritingCopilotComponent implements OnDestroy {
  private readonly copilot = inject(WritingCopilotService);
  private readonly catalog = inject(ModelCatalogService);
  private readonly library = inject(LibraryService);
  private readonly agency = inject(AgencyService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly queue = inject(GenerationQueueService);

  protected readonly step = signal<Step>(1);
  protected readonly sending = signal(false);
  protected readonly seconds = signal(0);
  /** Progreso estimado de la llamada al cerebro (0 a 100). */
  protected readonly progress = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly turns = signal<readonly WritingCopilotTurn[]>([]);
  protected readonly copied = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  // ── Paso 1: idea + parámetros ───────────────────────────────────
  protected readonly idea = signal('');
  protected readonly brainModel = signal('');
  protected readonly outputLanguage = signal<'es' | 'en' | 'bilingual'>('es');
  protected readonly delivery = signal<Delivery>('sequence');
  protected readonly aspectRatio = signal('9:16');
  protected readonly totalDuration = signal<number | null>(null);
  protected readonly maxClipS = signal<number | null>(null);
  protected readonly shotCount = signal<number | null>(null);
  protected readonly fps = signal<number | null>(null);
  protected readonly look = signal('');
  protected readonly audioMode = signal<AudioMode>('auto');
  protected readonly videoModel = signal<AiModel | null>(null);

  // ── Paso 2: conversación + insumos ──────────────────────────────
  protected readonly followUp = signal('');
  protected readonly assets = signal<readonly CopilotAsset[]>([]);
  protected readonly uploading = signal(false);
  /** Extrayendo el texto de un documento (PDF/DOCX/TXT/MD). */
  protected readonly extractingDoc = signal(false);

  // ── Paso 3: prompt final ────────────────────────────────────────
  protected readonly finalPrompt = signal<string | null>(null);
  /** El clip ya viajo a la cola de generacion. */
  protected readonly queued = signal(false);

  private readonly textModels = toSignal(this.catalog.byModality('text').pipe(catchError(() => of([] as AiModel[]))), {
    initialValue: [] as AiModel[],
  });
  private readonly videoModels = toSignal(this.catalog.byModality('video').pipe(catchError(() => of([] as AiModel[]))), {
    initialValue: [] as AiModel[],
  });

  protected readonly brainOptions = computed(() =>
    this.textModels().map((model) => ({ label: model.display_name || model.name, value: model.name })),
  );
  protected readonly videoOptions = computed(() =>
    this.videoModels().map((model) => ({ label: model.display_name || model.name, value: model.name })),
  );

  protected readonly taggedAssets = computed(() => tagAssets(this.assets()));
  protected readonly finalSegments = computed<readonly PromptSegment[]>(() => {
    const text = this.finalPrompt();
    return text ? highlightPrompt(text, [], promptKinds(this.taggedAssets())) : [];
  });

  protected readonly stepItems = computed<MenuItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('VIDEOMACHINE.WRITE_STEP_IDEA') },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_STEP_PROMPTS') },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_STEP_FINAL') },
    ];
  });

  protected readonly canSend = computed(() => !this.sending() && this.idea().trim().length > 0);
  protected readonly canFollowUp = computed(() => !this.sending() && this.followUp().trim().length > 0);
  protected readonly canTranslate = computed(() => !this.sending() && this.turns().length > 0);

  protected readonly languageOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('VIDEOMACHINE.WRITE_LANGUAGE_ES'), value: 'es' as const },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_LANGUAGE_EN'), value: 'en' as const },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_LANGUAGE_BILINGUAL'), value: 'bilingual' as const },
    ];
  });

  protected readonly deliveryOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('VIDEOMACHINE.WRITE_DELIVERY_SEQUENCE'), value: 'sequence' as Delivery },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_DELIVERY_SHOTS'), value: 'shot_pack' as Delivery },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_DELIVERY_AUTO'), value: 'auto' as Delivery },
    ];
  });

  protected readonly audioOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('VIDEOMACHINE.WRITE_AUDIO_AUTO'), value: 'auto' as AudioMode },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_AUDIO_DIALOGUE'), value: 'with_dialogue' as AudioMode },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_AUDIO_DIEGETIC'), value: 'diegetic_only' as AudioMode },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_AUDIO_MUSIC'), value: 'with_music_notes' as AudioMode },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_AUDIO_SILENT'), value: 'silent' as AudioMode },
    ];
  });

  protected readonly roleOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('VIDEOMACHINE.WRITE_ROLE_PERSON'), value: 'person' as CopilotAssetRole },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_ROLE_PRODUCT'), value: 'product' as CopilotAssetRole },
      { label: this.translate.instant('VIDEOMACHINE.WRITE_ROLE_ENVIRONMENT'), value: 'environment' as CopilotAssetRole },
    ];
  });

  protected readonly aspectOptions = ['9:16', '16:9', '1:1', '4:5'].map((ratio) => ({ label: ratio, value: ratio }));

  protected readonly quickActions = computed(() => {
    this.translate.currentLang();
    return [
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_DARKER'),
        message: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_DARKER_MSG'),
      },
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_VERTICAL'),
        message: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_VERTICAL_MSG'),
      },
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_SHOTS'),
        message: this.translate.instant('VIDEOMACHINE.WRITE_QUICK_SHOTS_MSG'),
      },
    ];
  });

  constructor() {
    // Modelo por defecto: el mejor cerebro de texto del catálogo para este
    // trabajo; si no está, se deja el default del back.
    this.catalog
      .byModality('text')
      .pipe(catchError(() => of([] as AiModel[])))
      .subscribe((models) => {
        if (this.brainModel()) return;
        const preferred = models.find((model) => model.name.includes(PREFERRED_BRAIN));
        if (preferred) this.brainModel.set(preferred.name);
      });
    this.catalog
      .byModality('video')
      .pipe(catchError(() => of([] as AiModel[])))
      .subscribe((models) => {
        if (this.videoModel()) return;
        const preferred = models.find((model) => model.name === DEFAULT_VIDEO_MODEL) ?? models[0];
        if (preferred) this.videoModel.set(preferred);
      });
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  /** Sube un documento de texto (PDF, DOCX, TXT, MD) y suma su texto a la idea. */
  protected async onDocumentPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.error.set(null);
    this.extractingDoc.set(true);
    try {
      const result = await firstValueFrom(this.agency.extractBrief(file));
      const text = (result?.text ?? '').trim();
      if (!text) {
        this.error.set(this.translate.instant('VIDEOMACHINE.WRITE_DOC_EMPTY'));
        return;
      }
      this.idea.update((prev) => (prev.trim() ? prev.trim() + '\n\n' + text : text));
    } catch {
      this.error.set(this.translate.instant('VIDEOMACHINE.WRITE_DOC_ERR'));
    } finally {
      this.extractingDoc.set(false);
    }
  }

  protected onIdeaInput(value: string): void {
    this.idea.set(value);
  }

  protected start(): void {
    const message = this.idea().trim();
    if (!message) return;
    this.error.set(null);
    this.sending.set(true);
    this.startTimer();
    this.copilot
      .chat({
        model: this.brainModel() || undefined,
        message,
        params: this.buildParams(),
        reference_files: this.referenceImageIds(),
      })
      .pipe(
        catchError((err: unknown) => {
          this.fail(err);
          return EMPTY;
        }),
        finalize(() => this.finish()),
      )
      .subscribe((response) => {
        this.turns.set([
          { role: 'user', content: message },
          { role: 'assistant', content: response.text },
        ]);
        this.idea.set('');
        this.finalPrompt.set(null);
        this.step.set(2);
      });
  }

  protected sendFollowUp(message?: string): void {
    const text = (message ?? this.followUp()).trim();
    if (!text || this.sending()) return;
    this.error.set(null);
    this.sending.set(true);
    this.startTimer();
    this.copilot
      .chat({ model: this.brainModel() || undefined, message: text, history: this.history() })
      .pipe(
        catchError((err: unknown) => {
          this.fail(err);
          return EMPTY;
        }),
        finalize(() => this.finish()),
      )
      .subscribe((response) => {
        this.turns.update((list) => [...list, { role: 'user', content: text }, { role: 'assistant', content: response.text }]);
        this.followUp.set('');
        this.finalPrompt.set(null);
        this.copied.set(null);
      });
  }

  /** Paso 3: prompt final en inglés con los insumos tagueados. */
  protected toFinalPrompt(): void {
    if (!this.canTranslate()) return;
    this.error.set(null);
    this.sending.set(true);
    this.startTimer();
    const params: WritingCopilotParams = {
      ...this.buildParams(),
      output_language: 'en',
      response_mode: 'prompt_only',
    };
    const references = buildReferences(this.taggedAssets());
    this.copilot
      .chat({
        model: this.brainModel() || undefined,
        message: FINAL_PROMPT_INSTRUCTION,
        history: this.history(),
        params,
        references: references || undefined,
        reference_files: this.referenceImageIds(),
      })
      .pipe(
        catchError((err: unknown) => {
          this.fail(err);
          return EMPTY;
        }),
        finalize(() => this.finish()),
      )
      .subscribe((response) => {
        this.finalPrompt.set(response.text.trim());
        this.queued.set(false);
        this.copied.set(null);
        this.step.set(3);
      });
  }

  protected restart(): void {
    this.turns.set([]);
    this.queued.set(false);
    this.idea.set('');
    this.followUp.set('');
    this.assets.set([]);
    this.finalPrompt.set(null);
    this.error.set(null);
    this.step.set(1);
  }

  protected goToStep(step: Step): void {
    if (step === 2 && this.turns().length === 0) return;
    if (step === 3 && !this.finalPrompt()) return;
    this.step.set(step);
  }

  protected segments(content: string): readonly WritingSegment[] {
    return splitFences(content);
  }

  protected copy(text: string, key: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      this.copied.set(key);
      setTimeout(() => {
        if (this.copied() === key) this.copied.set(null);
      }, 2000);
    });
  }

  // ── Insumos ─────────────────────────────────────────────────────

  protected onAssetsPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.error.set(null);
    this.uploading.set(true);
    const uploads = files.map((file) => {
      const kind = attachmentKind(file);
      if (!kind) {
        this.error.set(this.translate.instant('VIDEOMACHINE.WRITE_ERR_ASSET'));
        return of(null);
      }
      const category = kind === 'video' ? 'videos' : kind === 'audio' ? 'audio' : 'images';
      return this.library.uploadFile(file, category).pipe(
        map(
          (asset): CopilotAsset => ({
            id: asset.id,
            name: file.name,
            kind,
            role: kind === 'image' ? 'product' : 'product',
            url: asset.thumbnail_url || asset.url || '',
          }),
        ),
        catchError((err: unknown) => {
          this.fail(err);
          return of(null);
        }),
      );
    });
    forkJoin(uploads)
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe((items) => {
        const added = items.filter((item): item is CopilotAsset => !!item);
        if (added.length) this.assets.update((list) => [...list, ...added]);
      });
  }

  protected removeAsset(id: string): void {
    this.assets.update((list) => list.filter((asset) => asset.id !== id));
  }

  protected setAssetRole(id: string, role: CopilotAssetRole): void {
    this.assets.update((list) => list.map((asset) => (asset.id === id ? { ...asset, role } : asset)));
  }

  protected assetTag(id: string): string {
    return this.taggedAssets().find((asset) => asset.id === id)?.tag ?? '';
  }

  protected onVideoModelChange(name: string): void {
    this.videoModel.set(this.videoModels().find((model) => model.name === name) ?? null);
  }

  /** Tono del tag segun el tipo/rol del insumo (sistema de colores). */
  protected assetTone(asset: CopilotAsset): string {
    if (asset.kind === 'video') return 'video';
    if (asset.kind === 'audio') return 'audio';
    return asset.role === 'person' ? 'character' : asset.role === 'environment' ? 'location' : 'product';
  }

  protected assetKindLabel(kind: CopilotAsset['kind']): string {
    const key =
      kind === 'video'
        ? 'VIDEOMACHINE.WRITE_KIND_VIDEO'
        : kind === 'audio'
          ? 'VIDEOMACHINE.WRITE_KIND_AUDIO'
          : 'VIDEOMACHINE.WRITE_KIND_IMAGE';
    return this.translate.instant(key);
  }

  /** Ids de las imagenes subidas que el cerebro recibe como vision. */
  private referenceImageIds(): string[] | undefined {
    const ids = this.taggedAssets()
      .filter((asset) => asset.kind === 'image')
      .map((asset) => asset.id);
    return ids.length > 0 ? ids : undefined;
  }

  /** Lleva el prompt final y sus insumos al Estudio (reuso precargado). */
  protected openInStudio(): void {
    const payload = this.studioPayload();
    if (!payload) return;
    sessionStorage.setItem('studio:reuse', JSON.stringify(payload));
    void this.router.navigate(['/studio']);
  }

  /** Encola el clip para generarlo a demanda desde el Estudio. */
  protected sendToQueue(): void {
    const payload = this.studioPayload();
    const model = this.videoModel();
    if (!payload || !model) return;
    this.queue.add([
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_QUEUE_LABEL', { model: model.display_name || model.name }),
        source: 'writing_copilot',
        prompt: payload.prompt,
        assets: this.taggedAssets().map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind })),
        model: model.name,
        modelDisplayName: model.display_name || model.name,
        ratio: payload.ratio,
        duration: payload.duration ?? 0,
        resolution: payload.resolution,
        generateAudio: payload.generateAudio,
      },
    ]);
    this.queued.set(true);
  }

  private studioPayload(): { prompt: string; model: string; ratio: string; duration?: number; resolution: string; generateAudio: boolean; content: unknown[] } | null {
    const prompt = this.finalPrompt();
    const model = this.videoModel();
    if (!prompt || !model) return null;
    const assets = this.taggedAssets();
    const content = [
      ...assets.filter((a) => a.kind === 'image').map((a) => ({ type: 'image' as const, id: a.id, name: a.name })),
      ...assets.filter((a) => a.kind === 'audio').map((a) => ({ type: 'audio' as const, id: a.id, name: a.name })),
      ...assets.filter((a) => a.kind === 'video').map((a) => ({ type: 'video' as const, id: a.id, name: a.name })),
      { type: 'text' as const, text: prompt },
    ];
    return {
      prompt,
      model: model.name,
      ratio: this.aspectRatio(),
      duration: this.totalDuration() ?? undefined,
      resolution: model.defaults?.resolutions?.[0] ?? '',
      generateAudio: this.audioMode() !== 'silent',
      content,
    };
  }

  // ── Internos ────────────────────────────────────────────────────

  private history(): WritingCopilotHistoryMessage[] {
    return this.turns().map((turn) => ({ role: turn.role, content: turn.content }));
  }

  /** Solo envía los parámetros que el usuario informó (nombres del skill). */
  private buildParams(): WritingCopilotParams {
    const params: WritingCopilotParams = {};
    if (this.outputLanguage()) params.output_language = this.outputLanguage();
    if (this.delivery()) params.delivery = this.delivery();
    if (this.aspectRatio()) params.aspect_ratio = this.aspectRatio();
    const total = this.totalDuration();
    if (typeof total === 'number' && total > 0) params.total_duration_s = total;
    const clip = this.maxClipS();
    if (typeof clip === 'number' && clip > 0) params.max_clip_s = clip;
    const shots = this.shotCount();
    if (typeof shots === 'number' && shots > 0) params.shot_count = shots;
    const fps = this.fps();
    if (typeof fps === 'number' && fps > 0) params.fps = fps;
    if (this.look().trim()) params.look = this.look().trim();
    const audio = this.audioMode();
    if (audio !== 'auto') params.audio_mode = audio;
    const target = this.videoModel();
    if (target) params.target_model = target.display_name || target.name;
    return params;
  }

  private startTimer(): void {
    this.stopTimer();
    this.seconds.set(0);
    this.progress.set(0);
    // Estimacion honesta: el back no hace streaming, asi que la barra avanza
    // hacia el 95 % y se completa cuando llega la respuesta.
    this.timer = setInterval(() => {
      this.seconds.update((value) => value + 1);
      this.progress.update((value) => Math.min(95, value + Math.max(1.5, (95 - value) * 0.06)));
    }, 400);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private finish(): void {
    this.sending.set(false);
    this.stopTimer();
    if (this.progress() > 0) {
      this.progress.set(100);
      setTimeout(() => this.progress.set(0), 700);
    }
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : '';
    this.error.set(message || this.translate.instant('VIDEOMACHINE.WRITE_ERR'));
  }
}
