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
import { Tooltip } from 'primeng/tooltip';

import {
  AiModel,
  WritingCopilotHistoryMessage,
  WritingCopilotParams,
  WritingCopilotTurn,
  WritingCopilotVideoType,
} from '@modules/agency/interfaces';
import { AgencyService, ModelCatalogService, WritingCopilotService } from '@modules/agency/services';
import { GenerationQueueService } from '@services/generation-queue.service';
import { LibraryService } from '@modules/library/services';
import { CameraMovementSelectComponent } from '@shared/components/camera/camera-movement-select.component';
import { CompactNumberComponent } from '@shared/components/compact-param/compact-number.component';
import { CompactSelectComponent } from '@shared/components/compact-param/compact-select.component';
import { cameraMovementPrompt } from '@shared/components/camera/camera-movements';
import { LightingSelectComponent } from '@shared/components/lighting/lighting-select.component';
import { LIGHTING_TEMPLATES, lightingPrompt } from '@shared/components/lighting/lighting-templates';
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

type Step = 1 | 2 | 3 | 4;
type Delivery = 'sequence' | 'shot_pack' | 'auto';
type AudioMode = 'auto' | 'diegetic_only' | 'with_dialogue' | 'with_music_notes' | 'silent';

const DEFAULT_VIDEO_MODEL = 'higgsfield-seedance-2-5-reference';
const PREFERRED_BRAIN = 'google/gemini-3.8-flash';

interface CopilotShot {
  key: string;
  index: number;
  excerpt: string;
  text: string;
}

const SHOT_MARKER = /^\s*(?:shot|plano|toma|escena)\s*\d+\b/i;

/** Separa un prompt en tomas numeradas; si no hay marcas, es una sola toma. */
function splitShotBlocks(block: string): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  for (const line of block.split('\n')) {
    if (SHOT_MARKER.test(line) && current.length > 0) {
      groups.push(current.join('\n').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) groups.push(current.join('\n').trim());
  const kept = groups.filter(Boolean);
  return kept.length > 0 ? kept : [block.trim()];
}

function excerptOf(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 130 ? `${clean.slice(0, 130)}…` : clean;
}

/**
 * VideoMachine Â· agente "Writing Copilot": convierte una idea, un guion o una
 * historia corta en prompts cinematogrÃ¡ficos (planos, cÃ¡mara, lentes, luz,
 * actuaciÃ³n, diÃ¡logo) y entrega el prompt final en inglÃ©s con los insumos
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
    Tooltip,
    LightingSelectComponent,
    CameraMovementSelectComponent,
    CompactSelectComponent,
    CompactNumberComponent,
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
  /** Luz elegida por toma (clave = key de CopilotShot). */
  protected readonly shotLighting = signal<Record<string, string | null>>({});
  /** Movimientos de cámara base del video. */
  protected readonly camera = signal<string[]>([]);
  /** Movimientos de cámara por toma (clave = key de CopilotShot). */
  protected readonly shotCamera = signal<Record<string, string[]>>({});
  private timer: ReturnType<typeof setInterval> | null = null;

  // â”€â”€ Paso 1: idea + parÃ¡metros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  protected readonly idea = signal('');
  /** Tipo de video: define la guía de estructura que sigue el cerebro. */
  protected readonly videoType = signal<WritingCopilotVideoType | null>(null);
  protected readonly brainModel = signal('');
  protected readonly outputLanguage = signal<'es' | 'en' | 'bilingual'>('es');
  protected readonly delivery = signal<Delivery>('sequence');
  protected readonly aspectRatio = signal('9:16');
  protected readonly totalDuration = signal<number | null>(null);
  protected readonly maxClipS = signal<number | null>(null);
  protected readonly shotCount = signal<number | null>(null);
  protected readonly cutsPerShot = signal<number | null>(null);
  protected readonly fps = signal<number | null>(null);
  protected readonly look = signal('');
  protected readonly audioMode = signal<AudioMode>('auto');
  protected readonly videoModel = signal<AiModel | null>(null);
  /** Esquema de iluminación / dirección de arte para todos los prompts. */
  protected readonly lighting = signal<string | null>(null);

  // â”€â”€ Paso 2: conversaciÃ³n + insumos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  protected readonly followUp = signal('');
  protected readonly assets = signal<readonly CopilotAsset[]>([]);
  protected readonly uploading = signal(false);
  /** Extrayendo el texto de un documento (PDF/DOCX/TXT/MD). */
  protected readonly extractingDoc = signal(false);

  // â”€â”€ Paso 3: prompt final â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const steps: readonly [string, string][] = [
      ['VIDEOMACHINE.WRITE_STEP_IDEA', 'VIDEOMACHINE.WRITE_STEP_IDEA_HINT'],
      ['VIDEOMACHINE.WRITE_STEP_PROMPTS', 'VIDEOMACHINE.WRITE_STEP_PROMPTS_HINT'],
      ['VIDEOMACHINE.WRITE_STEP_ART', 'VIDEOMACHINE.WRITE_STEP_ART_HINT'],
      ['VIDEOMACHINE.WRITE_STEP_FINAL', 'VIDEOMACHINE.WRITE_STEP_FINAL_HINT'],
    ];
    return steps.map(([labelKey, hintKey]) => {
      const hint = this.translate.instant(hintKey);
      return {
        label: `${this.translate.instant(labelKey)}<span class="sr-only"> — ${hint}</span><span class="vm-step-tip" aria-hidden="true">${hint}</span>`,
        escape: false,
      };
    });
  });

  /** Tomas detectadas en las respuestas del agente (una luz por toma). */
  protected readonly shots = computed<readonly CopilotShot[]>(() => {
    const blocks: string[] = [];
    for (const turn of this.turns()) {
      if (turn.role !== 'assistant') continue;
      for (const segment of splitFences(turn.content)) {
        if (segment.code) blocks.push(segment.content.trim());
      }
    }
    const shots: CopilotShot[] = [];
    blocks.forEach((block, blockIndex) => {
      for (const [shotIndex, part] of splitShotBlocks(block).entries()) {
        shots.push({
          key: `${blockIndex}-${shotIndex}`,
          index: shots.length + 1,
          excerpt: excerptOf(part),
          text: part,
        });
      }
    });
    return shots;
  });

  protected readonly canSend = computed(() => !this.sending() && this.videoType() !== null && this.idea().trim().length > 0);
  protected readonly canFollowUp = computed(() => !this.sending() && this.followUp().trim().length > 0);
  protected readonly canTranslate = computed(() => !this.sending() && this.turns().length > 0);

  /** Resumen de tiempos: tomas × duración por toma × total. */
  protected readonly timingSummary = computed(() => {
    this.translate.currentLang();
    const total = this.totalDuration();
    const shots = this.shotCount();
    if (!total || !shots || shots <= 0) return '';
    const perShot = Math.round((total / shots) * 10) / 10;
    return this.translate.instant('VIDEOMACHINE.WRITE_TIMING_SUMMARY', { shots, perShot, total });
  });

  protected readonly videoTypeOptions = computed(() => {
    this.translate.currentLang();
    return [
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_VIDEO_TYPE_COMMERCIAL_SHORT'),
        value: 'commercial_short' as WritingCopilotVideoType,
      },
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_VIDEO_TYPE_COMMERCIAL_LONG'),
        value: 'commercial_long' as WritingCopilotVideoType,
      },
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_VIDEO_TYPE_STORY_SHORT'),
        value: 'story_short' as WritingCopilotVideoType,
      },
      {
        label: this.translate.instant('VIDEOMACHINE.WRITE_VIDEO_TYPE_STORY_LONG'),
        value: 'story_long' as WritingCopilotVideoType,
      },
    ];
  });

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

  protected readonly aspectOptions = ['1:1', '3:4', '9:16', '4:3', '16:9', '21:9', '4:5'].map(
    (ratio) => ({ label: ratio, value: ratio }),
  );

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
    // Modelo por defecto: el mejor cerebro de texto del catÃ¡logo para este
    // trabajo; si no estÃ¡, se deja el default del back.
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

  protected setLanguage(value: string | number): void {
    this.outputLanguage.set(value as 'es' | 'en' | 'bilingual');
  }

  protected setDelivery(value: string | number): void {
    this.delivery.set(value as Delivery);
  }

  protected setAspect(value: string | number): void {
    this.aspectRatio.set(String(value));
  }

  protected setAudio(value: string | number): void {
    this.audioMode.set(value as AudioMode);
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
        this.shotLighting.set({});
        this.shotCamera.set({});
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
      .chat({
        model: this.brainModel() || undefined,
        message: text,
        history: this.history(),
        params: this.videoTypeParams(),
      })
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
        this.shotLighting.set({});
        this.shotCamera.set({});
        this.copied.set(null);
      });
  }

  /** Paso 3: dirección de arte por toma. */
  protected goToArtDirection(): void {
    if (this.turns().length === 0) return;
    const currentLighting = { ...this.shotLighting() };
    const currentCamera = { ...this.shotCamera() };
    for (const shot of this.shots()) {
      if (!(shot.key in currentLighting)) currentLighting[shot.key] = this.lighting();
      if (!(shot.key in currentCamera)) currentCamera[shot.key] = [...this.camera()];
    }
    this.shotLighting.set(currentLighting);
    this.shotCamera.set(currentCamera);
    this.step.set(3);
  }

  protected setShotLighting(key: string, value: string | null): void {
    this.shotLighting.update((map) => ({ ...map, [key]: value }));
  }

  protected setShotCamera(key: string, value: string[]): void {
    this.shotCamera.update((map) => ({ ...map, [key]: value }));
  }

  /** Bloque de luz por toma que recibe el cerebro al escribir el prompt final. */
  private lightingPerShot(): string {
    return this.shots()
      .map((shot) => {
        const id = this.shotLighting()[shot.key] ?? this.lighting();
        const template = id ? LIGHTING_TEMPLATES.find((item) => item.id === id) : undefined;
        return template ? `Toma ${shot.index} — ${template.name}\n${template.prompt}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  /** Bloque de movimientos de cámara por toma, en el orden elegido. */
  private cameraPerShot(): string {
    return this.shots()
      .map((shot) => {
        const block = cameraMovementPrompt(this.shotCamera()[shot.key] ?? this.camera());
        return block ? `Toma ${shot.index}:\n${block}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  /** Paso 4: prompt final en inglés con los insumos y la luz de cada toma. */
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
    const perShot = [this.lightingPerShot(), this.cameraPerShot()]
      .filter(Boolean)
      .join('\n\n');
    const message = perShot
      ? `${FINAL_PROMPT_INSTRUCTION}\n\nDIRECCIÓN POR TOMA (aplicá la luz y los movimientos a cada plano; no uses una sola luz para todo el video):\n${perShot}`
      : FINAL_PROMPT_INSTRUCTION;
    const references = buildReferences(this.taggedAssets());
    this.copilot
      .chat({
        model: this.brainModel() || undefined,
        message,
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
        this.step.set(4);
      });
  }

  protected restart(): void {
    this.turns.set([]);
    this.queued.set(false);
    this.idea.set('');
    this.followUp.set('');
    this.assets.set([]);
    this.finalPrompt.set(null);
    this.shotLighting.set({});
    this.shotCamera.set({});
    this.camera.set([]);
    this.error.set(null);
    this.step.set(1);
  }

  protected goToStep(step: Step): void {
    if ((step === 2 || step === 3) && this.turns().length === 0) return;
    if (step === 4 && !this.finalPrompt()) return;
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

  // â”€â”€ Insumos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  protected async onAssetsPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    this.error.set(null);
    this.uploading.set(true);
    const added: CopilotAsset[] = [];
    try {
      for (const file of files) {
        const kind = attachmentKind(file);
        if (!kind) {
          this.error.set(this.translate.instant('VIDEOMACHINE.WRITE_ERR_ASSET'));
          continue;
        }
        const category = kind === 'video' ? 'videos' : kind === 'audio' ? 'audio' : 'images';
        try {
          const uploaded = await firstValueFrom(this.library.uploadFile(file, category));
          added.push({
            id: uploaded.id,
            name: file.name,
            kind,
            role: 'product',
            url: uploaded.thumbnail_url || uploaded.url || '',
          });
        } catch (err) {
          this.fail(err);
        }
      }
    } finally {
      if (added.length) {
        this.assets.update((list) => [...list, ...added]);
        for (const asset of added) void this.archiveInLibrary(asset);
      }
      this.uploading.set(false);
    }
  }

  protected removeAsset(id: string): void {
    this.assets.update((list) => list.filter((asset) => asset.id !== id));
  }

  protected setAssetRole(id: string, role: CopilotAssetRole): void {
    this.assets.update((list) => list.map((asset) => (asset.id === id ? { ...asset, role } : asset)));
    const asset = this.assets().find((item) => item.id === id);
    if (asset) void this.archiveInLibrary(asset);
  }

  /**
   * Scroll de la página al abrir el selector de categoría. PrimeNG enfoca el
   * input del p-select sin `preventScroll` al cerrar el overlay, y el navegador
   * arrastra la página al principio: con varios insumos obligaba a bajar otra
   * vez después de elegir cada categoría. Guardamos el scroll al abrir y lo
   * devolvemos al cerrar, sólo si el cierre vino de elegir una opción.
   */
  private scrollYBeforeRoleSelect: number | null = null;
  private roleSelected = false;

  protected onRoleSelectOpen(): void {
    this.scrollYBeforeRoleSelect = typeof window === 'undefined' ? null : window.scrollY;
    this.roleSelected = false;
  }

  protected onRoleSelectShow(): void {
    const y = this.scrollYBeforeRoleSelect;
    if (y === null || typeof window === 'undefined') return;
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  }

  protected onRoleChange(id: string, role: CopilotAssetRole): void {
    if (this.scrollYBeforeRoleSelect === null && typeof window !== 'undefined') {
      this.scrollYBeforeRoleSelect = window.scrollY;
    }
    this.roleSelected = true;
    this.setAssetRole(id, role);
  }

  protected onRoleSelectClose(): void {
    const y = this.scrollYBeforeRoleSelect;
    const selected = this.roleSelected;
    this.scrollYBeforeRoleSelect = null;
    this.roleSelected = false;
    if (!selected || y === null || typeof window === 'undefined') return;
    const restore = (): void => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    };
    restore();
    setTimeout(restore, 0);
  }

  /**
   * Archiva la imagen en la biblioteca bajo la categoría elegida (personaje,
   * locación o prop) para que aparezca en Recursos y el Estudio la mencione
   * por su nombre de archivo.
   */
  private async archiveInLibrary(asset: CopilotAsset): Promise<void> {
    if (asset.kind !== 'image') return;
    const type = asset.role === 'person' ? 'character' : asset.role === 'environment' ? 'location' : 'prop';
    const stem = asset.name.replace(/\.[^.]+$/, '') || asset.name;
    try {
      if (asset.ingredientId) {
        await firstValueFrom(this.library.updateIngredient(asset.ingredientId, { type }));
        return;
      }
      const ingredient = await firstValueFrom(this.library.createIngredient({ type, name: stem }));
      if (!ingredient?.id) return;
      await firstValueFrom(this.library.addIngredientFile(ingredient.id, { file_id: asset.id }));
      this.assets.update((list) =>
        list.map((item) => (item.id === asset.id ? { ...item, ingredientId: ingredient.id } : item)),
      );
    } catch {
      // La imagen ya quedo en la biblioteca; el ingrediente es una mejora.
    }
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

  // â”€â”€ Internos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private history(): WritingCopilotHistoryMessage[] {
    return this.turns().map((turn) => ({ role: turn.role, content: turn.content }));
  }

  /** La guía de estructura viaja en cada turno para que el cerebro no la pierda. */
  private videoTypeParams(): WritingCopilotParams | undefined {
    const videoType = this.videoType();
    return videoType ? { video_type: videoType } : undefined;
  }

  /** Solo envÃ­a los parÃ¡metros que el usuario informÃ³ (nombres del skill). */
  private buildParams(): WritingCopilotParams {
    const params: WritingCopilotParams = {};
    const videoType = this.videoType();
    if (videoType) params.video_type = videoType;
    const light = this.lighting();
    if (light) params.lighting = lightingPrompt(light);
    const camera = cameraMovementPrompt(this.camera());
    if (camera) params.camera_movements = camera;
    if (this.outputLanguage()) params.output_language = this.outputLanguage();
    if (this.delivery()) params.delivery = this.delivery();
    if (this.aspectRatio()) params.aspect_ratio = this.aspectRatio();
    const total = this.totalDuration();
    if (typeof total === 'number' && total > 0) params.total_duration_s = total;
    const clip = this.maxClipS();
    if (typeof clip === 'number' && clip > 0) params.max_clip_s = clip;
    const shots = this.shotCount();
    if (typeof shots === 'number' && shots > 0) params.shot_count = shots;
    const cuts = this.cutsPerShot();
    if (typeof cuts === 'number' && cuts > 0) params.cuts_per_shot = cuts;
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