import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, EMPTY, finalize, firstValueFrom, map, mergeMap, of, throwError } from 'rxjs';
import { Observable } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { InputNumber } from 'primeng/inputnumber';
import { Textarea } from 'primeng/textarea';
import { Steps } from 'primeng/steps';
import { Checkbox } from 'primeng/checkbox';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';
import { MenuItem } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { Popover } from 'primeng/popover';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AgencyService } from '../../services/agency.service';
import { ModelCatalogService } from '../../services/model-catalog.service';
import { WritingCopilotService } from '../../services/writing-copilot.service';
import { ModelSelectComponent } from '../model-select/model-select.component';
import { InfoproductComponent } from '../infoproduct/infoproduct.component';
import { WritingCopilotComponent } from '../writing-copilot/writing-copilot.component';
import {
  AiModel,
  ContentItem,
  Credential,
  CredentialProvider,
  GenerateRequest,
  GeneratedAsset,
  Modality,
  StatusResponse,
} from '../../interfaces';
import { EventsService } from '@modules/events/services';
import { GenerationQueueService } from '@services/generation-queue.service';
import { Event as Project, Piece } from '@modules/events/interfaces';
import { PageContainerComponent, ValidatorErrors } from '@shared/components/index';
import { UiIcon } from '@shared/components/ui-icon/ui-icon.component';
import { AssetEditDialogComponent } from '@shared/components/asset-edit-dialog/asset-edit-dialog';
import { AutogrowDirective } from '@shared/components/autogrow/autogrow.directive';
import { UserSessionStore } from '@core/store/user.session';
import { GenerationEventsStore } from '@core/store/generation.events';
import { StudioTake } from '@modules/studio/interfaces';
import { ServerUrlPipe } from '@core/pipes';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { environment } from '@env/environment';
import {
  addPhotoFiles,
  imageTag,
  missingPhotosForPrompt,
  parseSuggestedPhotos,
  parseTagsFromText,
  pendingRequiredPhotos,
  PHOTO_KINDS,
  photoFileCount,
  PhotoKind,
  photoKindFromSuggestion,
  photoKindToFuncion,
  ProjectPhoto,
  ReferenceImage,
  referenceImagesForPrompt,
  referenceTagLines,
  removePhotoFile,
  RequiredPhoto,
  tagFromFilename,
  taggedPhotosForPrompt,
  TaggedPhoto,
} from './agency-photos';
import { composeBoardSheetPrompt } from './agency-storyboard-sheet';
import { ClipVinheta, composeSceneClipPrompt, rescaleClipDurations } from './agency-video-prompt';
import {
  planScenePrompt,
  ScenePromptArtifact,
  ScenePromptPlan,
  ScenePromptSlot,
  PromptSlotText,
  slotRangeForKind,
} from './agency-scene-prompt';
import { highlightPrompt, PromptSegment } from './agency-prompt-highlight';

type WorkflowPhase = 'input' | 'angles' | 'storyboard' | 'scenes';

/** Opción de los desplegables de modelo, con el proveedor para el badge. */
type ModelOption = {
  label: string;
  value: string;
  provider?: AiModel['credential_provider'];
};

/** Experto que analiza el proyecto (valor = workflow del agente en el back). */
type AgencyAgent = 'commercial' | 'real_estate' | 'cinema';

/** Agente de VideoMachine: no pertenece al flujo de proyecto, tiene su propia vista. */
const INFOPRODUCT_AGENT = 'infoproduct' as const;
/** Agente de VideoMachine con vista propia: convierte ideas en prompts. */
const WRITING_COPILOT_AGENT = 'writing_copilot' as const;
type AgentChoice = AgencyAgent | typeof INFOPRODUCT_AGENT | typeof WRITING_COPILOT_AGENT;

const AGENT_OPTIONS: { value: AgencyAgent; labelKey: string; hintKey: string }[] = [
  {
    value: 'commercial',
    labelKey: 'AGENCY.STUDIO.AGENT_COMMERCIAL',
    hintKey: 'AGENCY.STUDIO.AGENT_COMMERCIAL_HINT',
  },
  {
    value: 'real_estate',
    labelKey: 'AGENCY.STUDIO.AGENT_REAL_ESTATE',
    hintKey: 'AGENCY.STUDIO.AGENT_REAL_ESTATE_HINT',
  },
  {
    value: 'cinema',
    labelKey: 'AGENCY.STUDIO.AGENT_CINEMA',
    hintKey: 'AGENCY.STUDIO.AGENT_CINEMA_HINT',
  },
];

/** Encuadre del proyecto en el mensaje al agente, según el experto elegido. */
const AGENT_KIND_LABEL: Record<AgencyAgent, string> = {
  commercial: 'AGENCY.STUDIO.AGENT_KIND_COMMERCIAL',
  real_estate: 'AGENCY.STUDIO.AGENT_KIND_REAL_ESTATE',
  cinema: 'AGENCY.STUDIO.AGENT_KIND_CINEMA',
};

/** Slug de la ruta especializada del experto en el back. */
const AGENT_ROUTE_SLUG: Record<AgencyAgent, string> = {
  commercial: 'commercial',
  real_estate: 'real-estate',
  cinema: 'cinema',
};

/** Artefacto del paso 1 (ángulos / prompts / análisis) según el experto:
 *  cada agente tiene su propio contrato de salida en el back. */
const ARTIFACT_STEP1: Record<AgencyAgent, string> = {
  commercial: 'scene_prompts',
  real_estate: 'sales_angles',
  cinema: 'scene_analysis',
};

/** Mensaje del chat con el agente experto. */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Una invocación de herramienta del asistente, visible en el chat. */
interface ChatToolActivity {
  name: string;
  status: 'running' | 'ok' | 'error';
  summary: string;
  error: string;
}

interface SalesAngle {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  /** Prompt de escena del paso 1 (locación, personajes, beats): la base del
   *  prompt de video del paso Escenas. Ausente en los flujos sin artefacto. */
  artifact?: ScenePromptArtifact | null;
}

/** Viñeta del artefacto storyboard (paso 2, contrato validado en el back). */
interface StoryboardVinheta {
  n?: number;
  tipo_toma?: string;
  que_se_ve?: string;
  duracion_s?: number;
  foto_referencia?: string;
  movimiento_camara?: string;
  funcion?: string;
  importancia?: string;
}

/** Artefacto storyboard del back: viñetas + prompt de la hoja. */
interface StoryboardArtifact {
  vinetas: StoryboardVinheta[];
  prompt_hoja_storyboard?: string;
  fotos_faltantes?: string[];
}

/** Artefacto clip_prompt del back: prompt final del clip + notas editor. */
interface ClipArtifact {
  prompt_video?: string;
  notas_editor?: Record<string, unknown>;
}

/** Un prompt de video del paso Escenas y su resultado (un video por prompt). */
interface VideoPrompt {
  text: string;
  videoUrl?: string | null;
  generating?: boolean;
  /** Overrides por prompt (null = usar la config global del paso 4). */
  duration?: number | null;
  resolution?: string | null;
  audio?: boolean | null;
  /** Modelo de video propio de esta caja (null = el modelo del paso 4). */
  videoModel?: string | null;
  /** Relación de aspecto propia de esta caja (null/'' = la del paso 4). */
  ratio?: string | null;
  /** Task id de la generación: habilita calificar e "Ir a estudio" desde la card. */
  taskId?: string | null;
}

interface StoryboardScene {
  id: string;
  /** Ángulo de venta del que nace la escena (agrupación por ángulo). */
  angleId?: string;
  angleTitle?: string;
  title: string;
  description: string;
  shots: StoryboardShot[];
  /** Imagen-guía: hoja de storyboard con varias viñetas (generada en la modal). */
  boardImageUrl?: string | null;
  /** File id de la copia subida al store: imagen de referencia del video. */
  boardFileId?: string | null;
  boardGenerating?: boolean;
  /** Aprobación del storyboard: obligatoria para avanzar al paso Escenas. */
  approved?: boolean;
  /** Fotos de referencia de ESTA escena: sugieren qué subir y, recién
   *  aprobadas, habilitan "Generar Storyboard". */
  references?: ReferenceImage[];
  refsApproved?: boolean;
  /** Prompts del video de la escena (uno por segmento de duración). */
  prompts?: VideoPrompt[];
  /** Artefacto storyboard del experto (viñetas + prompt de la hoja). */
  boardArtifact?: StoryboardArtifact | null;
  /** Artefacto clip_prompt del experto (texto creativo del clip). */
  clipArtifact?: ClipArtifact | null;
  /** Artefacto `scene_prompts` del paso 1: arma el prompt de la escena. */
  sceneArtifact?: ScenePromptArtifact | null;
  /** Legado (flujo anterior): video único de la escena. */
  videoUrl?: string | null;
  generatingVideo?: boolean;
}

interface StoryboardShot {
  id: string;
  description: string;
  imageUrl: string | null;
  generating: boolean;
  /** Prompts del video de esta toma (uno por segmento de duración). */
  prompts?: VideoPrompt[];
}

/** Plantillas de ángulos de venta (se rotan si se piden más de las que hay). */
const ANGLE_TEMPLATES: { titleKey: string; descriptionKey: string }[] = [
  {
    titleKey: 'AGENCY.STUDIO.ANGLE_1_TITLE',
    descriptionKey: 'AGENCY.STUDIO.ANGLE_1_DESC',
  },
  {
    titleKey: 'AGENCY.STUDIO.ANGLE_2_TITLE',
    descriptionKey: 'AGENCY.STUDIO.ANGLE_2_DESC',
  },
  {
    titleKey: 'AGENCY.STUDIO.ANGLE_3_TITLE',
    descriptionKey: 'AGENCY.STUDIO.ANGLE_3_DESC',
  },
  {
    titleKey: 'AGENCY.STUDIO.ANGLE_4_TITLE',
    descriptionKey: 'AGENCY.STUDIO.ANGLE_4_DESC',
  },
  {
    titleKey: 'AGENCY.STUDIO.ANGLE_5_TITLE',
    descriptionKey: 'AGENCY.STUDIO.ANGLE_5_DESC',
  },
];

/** Fotos sugeridas por tipo de ángulo: keywords sobre título + descripción.
 *  Ej.: "lujo" → acabados, salón de reuniones, alcoba; "seguridad" → portón,
 *  equipo de seguridad. Primera coincidencia que matchea manda.
 *  Los `keywords` son tokens de matching (contra texto del agente), no UI:
 *  quedan sin traducir; `itemKeys` son los textos visibles/prompt i18n. */
const REFERENCE_SUGGESTIONS: { keywords: string[]; itemKeys: string[] }[] = [
  // Especialización por escena: elementos concretos de los planos y tomas.
  {
    keywords: ['fachada', 'entrada', 'exterior', 'atardecer', 'torre'],
    itemKeys: [
      'AGENCY.STUDIO.REF_FACADE_SUNSET',
      'AGENCY.STUDIO.REF_MAIN_ENTRANCE',
      'AGENCY.STUDIO.REF_TOWER_VIEW',
    ],
  },
  {
    keywords: ['cocina', 'comedor'],
    itemKeys: ['AGENCY.STUDIO.REF_FINISHED_KITCHEN', 'AGENCY.STUDIO.REF_KITCHEN_ISLAND'],
  },
  {
    keywords: ['lobby', 'recepci', 'reuniones', 'salón', 'salon'],
    itemKeys: ['AGENCY.STUDIO.REF_ACCESS_LOBBY', 'AGENCY.STUDIO.REF_MEETING_ROOM'],
  },
  {
    keywords: ['alcoba', 'dormitorio', 'habitaci'],
    itemKeys: ['AGENCY.STUDIO.REF_MASTER_BEDROOM', 'AGENCY.STUDIO.REF_WINDOW_DETAIL'],
  },
  {
    keywords: ['piscina', 'gimnasio', 'jardín', 'jardin', 'terraza', 'deck'],
    itemKeys: ['AGENCY.STUDIO.REF_POOL', 'AGENCY.STUDIO.REF_TERRACE_GARDEN'],
  },
  // Marco del ángulo: el contexto general del que nace la escena.
  {
    keywords: ['lujo', 'premium', 'exclusiv', 'acabado', 'amenit'],
    itemKeys: [
      'AGENCY.STUDIO.REF_PREMIUM_FINISHES',
      'AGENCY.STUDIO.REF_MEETING_ROOM',
      'AGENCY.STUDIO.REF_MASTER_BEDROOM',
      'AGENCY.STUDIO.REF_EXCLUSIVE_AMENITIES',
    ],
  },
  {
    keywords: [
      'seguridad',
      'vigilanc',
      'portón',
      'porton',
      'cámara',
      'camara',
      'control de acceso',
    ],
    itemKeys: [
      'AGENCY.STUDIO.REF_BUILDING_GATE',
      'AGENCY.STUDIO.REF_SECURITY_TEAM',
      'AGENCY.STUDIO.REF_CONTROLLED_ACCESS',
    ],
  },
  {
    keywords: ['inversi', 'rentab', 'plusval', 'financ', 'oportunidad'],
    itemKeys: [
      'AGENCY.STUDIO.REF_FACADE',
      'AGENCY.STUDIO.REF_SKYLINE_VIEWS',
      'AGENCY.STUDIO.REF_DEVELOPING_AREA',
    ],
  },
  {
    keywords: ['estilo de vida', 'comunidad', 'entorno', 'familiar', 'barrio', 'vecin'],
    itemKeys: [
      'AGENCY.STUDIO.REF_COMMON_AREAS',
      'AGENCY.STUDIO.REF_COMMUNITY_LIFE',
      'AGENCY.STUDIO.REF_NEIGHBORHOOD',
    ],
  },
  {
    keywords: ['ubicaci', 'conectiv', 'transporte', 'accesibil'],
    itemKeys: [
      'AGENCY.STUDIO.REF_AREA_VIEW',
      'AGENCY.STUDIO.REF_NEARBY_TRANSPORT',
      'AGENCY.STUDIO.REF_POINTS_OF_INTEREST',
    ],
  },
  {
    keywords: ['sosten', 'diseñ', 'disen', 'energ', 'verde', 'natural', 'ecol'],
    itemKeys: [
      'AGENCY.STUDIO.REF_GREEN_SPACES',
      'AGENCY.STUDIO.REF_SUSTAINABLE_MATERIALS',
      'AGENCY.STUDIO.REF_CONTEMPORARY_DESIGN',
    ],
  },
];

const DEFAULT_REFERENCE_SUGGESTIONS: string[] = [
  'AGENCY.STUDIO.REF_FACADE',
  'AGENCY.STUDIO.REF_COMMON_AREAS',
  'AGENCY.STUDIO.REF_GENERAL_VIEW',
];

/** Parsea un evento SSE del agente ({event, data}), o null. */
function parseAgentEvent(rawEvent: string): { name: string; data: Record<string, unknown> } | null {
  const [eventLine, dataLine] = rawEvent.split('\n');
  const name = eventLine?.replace('event: ', '') ?? '';
  if (!name || !dataLine) return null;
  try {
    return { name, data: JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown> };
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-agency',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    PageContainerComponent,
    ValidatorErrors,
    UiIcon,
    Tooltip,
    Button,
    Card,
    InputText,
    Textarea,
    Steps,
    Checkbox,
    Tag,
    Message,
    ProgressSpinner,
    Select,
    InputNumber,
    Dialog,
    Popover,
    ToggleSwitch,
    AutogrowDirective,
    ModelSelectComponent,
    InfoproductComponent,
    WritingCopilotComponent,
    ServerUrlPipe,
    LowerCasePipe,
    TranslatePipe,
    AssetEditDialogComponent,
  ],
  templateUrl: './agency.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly catalog = inject(ModelCatalogService);
  private readonly writingCopilot = inject(WritingCopilotService);
  private readonly eventsService = inject(EventsService);
  private readonly generationQueue = inject(GenerationQueueService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly session = inject(UserSessionStore);
  /** Copia la hoja de storyboard al store para usarla como referencia de video. */
  private readonly libraryService = inject(LibraryService);
  /** Cola global y take reel de generaciones (compartido con el studio). */
  private readonly eventsStore = inject(GenerationEventsStore);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly currentPhase = signal<WorkflowPhase>('input');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(0);

  /** Experto elegido para analizar el proyecto (default: comercial). */
  protected readonly agent = signal<AgencyAgent>('commercial');
  /** Prompts ya enviados a la cola (feedback del boton). */
  protected readonly queuedPrompts = signal<ReadonlySet<string>>(new Set<string>());
  /** VideoMachine: el agente "Infoproducto" reemplaza el flujo de proyecto. */
  protected readonly infoproductMode = signal(false);
  /** VideoMachine: el agente Writing Copilot tiene su propia vista. */
  protected readonly writingCopilotMode = signal(false);
  /** Disponibilidad del agente Writing Copilot (flag + skill ok en el back). */
  protected readonly writingCopilotAvailable = signal(false);
  protected readonly agentChoice = computed<AgentChoice>(() =>
    this.infoproductMode() ? INFOPRODUCT_AGENT : this.writingCopilotMode() ? WRITING_COPILOT_AGENT : this.agent(),
  );
  protected readonly agentOptions = computed(() => {
    this.translate.currentLang();
    return [
      ...AGENT_OPTIONS.map((o) => ({
        value: o.value as AgentChoice,
        label: this.translate.instant(o.labelKey),
        hint: this.translate.instant(o.hintKey),
      })),
      {
        value: INFOPRODUCT_AGENT as AgentChoice,
        label: this.translate.instant('VIDEOMACHINE.AGENT_LABEL'),
        hint: this.translate.instant('VIDEOMACHINE.AGENT_HINT'),
      },
      ...(this.writingCopilotAvailable()
        ? [
            {
              value: WRITING_COPILOT_AGENT as AgentChoice,
              label: this.translate.instant('VIDEOMACHINE.WRITE_AGENT_LABEL'),
              hint: this.translate.instant('VIDEOMACHINE.WRITE_AGENT_HINT'),
            },
          ]
        : []),
    ];
  });
  protected readonly agentLabel = computed(
    () => this.agentOptions().find((o) => o.value === this.agentChoice())?.label ?? '',
  );
  protected readonly agentHint = computed(
    () => this.agentOptions().find((o) => o.value === this.agentChoice())?.hint ?? '',
  );
  /** Placeholder del contexto, adaptado al experto elegido. */
  protected readonly descriptionPlaceholder = computed(() => {
    this.translate.currentLang();
    const tail = this.translate.instant('AGENCY.STUDIO.CONTEXT_TAIL');
    switch (this.agent()) {
      case 'real_estate':
        return this.translate.instant('AGENCY.STUDIO.CONTEXT_PH_RE', { tail });
      case 'cinema':
        return this.translate.instant('AGENCY.STUDIO.CONTEXT_PH_CINEMA', { tail });
      default:
        return this.translate.instant('AGENCY.STUDIO.CONTEXT_PH_COMMERCIAL', { tail });
    }
  });

  /** Nombre del paso 2 según el experto: ángulos (inmobiliaria) o prompts. */
  protected readonly anglesStepName = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(
      this.agent() === 'real_estate' ? 'AGENCY.STUDIO.STEP_ANGLES' : 'AGENCY.STUDIO.STEP_PROMPTS',
    );
  });
  /** Etiqueta del botón de análisis del paso 1: el inmobiliario genera
   *  ángulos; el comercial y el de cine generan prompts de escena. */
  protected readonly generateLabelKey = computed(() =>
    this.agent() === 'real_estate'
      ? 'AGENCY.STUDIO.P1_GENERATE'
      : 'AGENCY.STUDIO.P1_GENERATE_PROMPTS',
  );

  /** Sustantivo en minúscula para las frases del flujo. */
  protected readonly anglesNoun = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(
      this.agent() === 'real_estate' ? 'AGENCY.STUDIO.NOUN_ANGLES' : 'AGENCY.STUDIO.NOUN_PROMPTS',
    );
  });

  /**
   * El comercial publicitario no pasa por Storyboard: sus prompts del paso 1
   * ya son escenas filmables del spot y las imágenes de referencia entran en
   * el paso 1, así que el flujo va Documentación → Prompts → Escenas.
   */
  protected readonly isCommercial = computed(() => this.agent() === 'commercial');

  protected readonly phases = computed<{ key: WorkflowPhase; name: string }[]>(() => {
    const phases: { key: WorkflowPhase; name: string }[] = [
      { key: 'input', name: this.translate.instant('AGENCY.STUDIO.PHASE_DOCUMENTATION') },
      { key: 'angles', name: this.anglesStepName() },
    ];
    if (!this.isCommercial()) {
      phases.push({
        key: 'storyboard',
        name: this.translate.instant('AGENCY.STUDIO.PHASE_STORYBOARD'),
      });
    }
    phases.push({ key: 'scenes', name: this.translate.instant('AGENCY.STUDIO.PHASE_SCENES') });
    return phases;
  });

  protected readonly phaseIndex = computed(() =>
    this.phases().findIndex((p) => p.key === this.currentPhase()),
  );

  protected readonly stepItems = computed<MenuItem[]>(() =>
    this.phases().map((phase, i) => ({
      label: phase.name,
      command: () => this.goToPhase(phase.key),
    })),
  );

  protected readonly models = signal<readonly AiModel[]>([]);
  /** Credenciales del tenant: de ahí salen los modelos LLM configurados. */
  protected readonly credentials = signal<Credential[]>([]);
  /** Modelo elegido por paso: '' = automático (default del back). */
  protected readonly modelText = signal('');
  protected readonly modelImage = signal('');
  protected readonly modelVideo = signal('');
  /** Ángulos: catálogo de texto (razonamiento primero) + los modelos LLM
   *  guardados en admin/models (openrouter/anthropic extra.model). */
  protected readonly modelTextOptions = computed(() => {
    const usable = this.credentials().filter(
      (c) => !!c.api_key_mask && (c.provider === 'openrouter' || c.provider === 'anthropic'),
    );
    const configured = new Set(usable.map((c) => c.provider));
    // Solo modelos de proveedores con credencial: el resto fallaría al
    // enviarse a la API del proveedor elegido.
    const options = this.modelOptionsFor('text').filter(
      (o) => !o.provider || configured.has(o.provider),
    );
    const known = new Set(options.map((o) => this.normalizedModelName(o.value)));
    for (const cred of usable) {
      const model = this.credentialModel(cred);
      if (model && !known.has(this.normalizedModelName(model)) && !this.isMediaModel(model)) {
        known.add(this.normalizedModelName(model));
        options.push({ label: model, value: model, provider: cred.provider });
      }
    }
    return options;
  });
  /** Modelos LLM guardados en admin/models (openrouter/anthropic extra.model):
   *  van como opciones extra del selector de texto, después del catálogo. */
  protected readonly extraTextModels = computed<AiModel[]>(() => {
    const known = new Set(
      this.models().filter((m) => m.modality === 'text').map((m) => m.name),
    );
    const extras: AiModel[] = [];
    for (const cred of this.credentials()) {
      if (cred.provider !== 'openrouter' && cred.provider !== 'anthropic') continue;
      const name = this.credentialModel(cred);
      if (!name || known.has(name) || extras.some((o) => o.name === name)) continue;
      known.add(name);
      extras.push({
        name,
        display_name: `${name} · ${cred.provider}`,
        modality: 'text',
        generator: '',
        credential_provider: cred.provider,
        base_url: '',
        endpoint: '',
        gallery_sync: false,
        defaults: {},
      });
    }
    return extras;
  });
  protected readonly projectDescription = signal('');
  protected readonly angles = signal<SalesAngle[]>(this.buildAngles(3));
  /** Ids de ángulos tildados: derivado de `angles` para que nunca se
   *  desincronice del estado real (antes era una copia a mano que un
   *  restore podía pisar). */
  protected readonly selectedAngles = computed(() =>
    this.angles()
      .filter((a) => a.selected)
      .map((a) => a.id),
  );

  protected readonly storyboard = signal<StoryboardScene[]>([]);

  // ─── Storyboard: modal de viñetas + aprobación ─────────────────────
  /** Escena abierta en la modal de storyboard (null = cerrada). */
  protected readonly boardSceneId = signal<string | null>(null);
  protected readonly boardVisible = signal(false);
  /** Cantidad de viñetas sugerida en la modal (una toma por viñeta). */
  protected readonly boardShotCount = signal(3);
  /** Relación de aspecto de la hoja de storyboard ('' = default del modelo). */
  protected readonly boardRatio = signal('');
  /** Prompt editable de la hoja de storyboard. */
  protected readonly boardPrompt = signal('');
  /** Turno de artefacto storyboard en curso (sugerencia del experto). */
  protected readonly boardAgentLoading = signal(false);
  /** Escena cuyo prompt de clip se está sugiriendo con el experto. */
  protected readonly clipAgentSceneId = signal<string | null>(null);
  /** El usuario editó el prompt a mano: no se pisa al cambiar la cantidad de tomas. */
  protected readonly boardPromptEdited = signal(false);

  // ─── Escenas: configuración de los videos ─────────────────────
  /** Duración total pedida por video (s). Si supera la capacidad del modelo
   *  se parte en varios videos → varios prompts por escena/toma. */
  protected readonly videoDuration = signal(10);
  /** Relación de aspecto elegida ('' = default del modelo). */
  protected readonly videoRatio = signal('');
  /** Resolución elegida ('' = default del modelo). */
  protected readonly videoResolution = signal('');
  /** Si el video se genera con sonido (parámetro `generate_audio` del back). */
  protected readonly videoAudio = signal(true);
  /** Tags de referencia que se inyectan en todos los prompts.
   *  Sin input en la UI (se eliminó del panel): se conserva por compatibilidad
   *  con avances guardados que todavía traen `videoSettings.tags`. */
  protected readonly videoTags = signal('');

  /** Escena actual de la modal. */
  protected readonly boardScene = computed(() => {
    const id = this.boardSceneId();
    return id ? (this.storyboard().find((s) => s.id === id) ?? null) : null;
  });

  /** Escenas agrupadas por su ángulo de venta (Storyboard y Escenas). */
  protected readonly scenesByAngle = computed(() => {
    const groups: { angleId: string; angleTitle: string; scenes: StoryboardScene[] }[] = [];
    for (const scene of this.storyboard()) {
      const key = scene.angleId || 'sin-angle';
      let group = groups.find((g) => g.angleId === key);
      if (!group) {
        group = { angleId: key, angleTitle: scene.angleTitle || 'Escenas', scenes: [] };
        groups.push(group);
      }
      group.scenes.push(scene);
    }
    return groups;
  });

  /** Modelo de imagen elegido (o el primero disponible). */
  protected readonly activeImageModel = computed(() => {
    const list = this.models().filter((m) => m.modality === 'image');
    return list.find((m) => m.name === this.modelImage()) ?? list[0] ?? null;
  });

  /** Relaciones de aspecto que soporta el modelo de imagen activo. */
  protected readonly imageRatioOptions = computed(() => {
    const ratios = this.activeImageModel()?.defaults?.ratios ?? [];
    return [
      { label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO_RATIO'), value: '' },
      ...ratios.map((r) => ({ label: r, value: r })),
    ];
  });

  /** Modelo de video elegido (o el primero disponible). */
  protected readonly activeVideoModel = computed(() => {
    const list = this.models().filter((m) => m.modality === 'video');
    return list.find((m) => m.name === this.modelVideo()) ?? list[0] ?? null;
  });

  /** Máxima duración (s) que soporta el modelo de video activo; 0 = desconocida. */
  protected readonly videoMaxDuration = computed(() => {
    const durations = this.activeVideoModel()?.defaults?.durations ?? [];
    return durations.length ? Math.max(...durations) : 0;
  });

  /** Cantidad de videos en los que se parte la duración pedida. */
  protected readonly videoSegmentCount = computed(() => {
    const max = this.videoMaxDuration();
    const total = this.videoDuration();
    if (!max || total <= max) return 1;
    return Math.ceil(total / max);
  });

  /** Relaciones de aspecto del modelo de video activo. */
  protected readonly videoRatioOptions = computed(() => {
    const ratios = this.activeVideoModel()?.defaults?.ratios ?? [];
    return [
      { label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO_RATIO'), value: '' },
      ...ratios.map((r) => ({ label: r, value: r })),
    ];
  });

  /** Calidades (resoluciones) que soporta el modelo de video activo. */
  protected readonly videoResolutionOptions = computed(() => {
    const resolutions = this.activeVideoModel()?.defaults?.resolutions ?? [];
    return [
      { label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO_RATIO'), value: '' },
      ...resolutions.map((r) => ({ label: r, value: r })),
    ];
  });

  // ─── Proyecto (centralización de recursos) ────────────────────
  protected readonly projects = signal<Project[]>([]);
  protected readonly projectOptions = computed(() =>
    this.projects().map((p) => ({ label: p.name, value: p.id })),
  );
  protected readonly selectedProjectId = signal<string | null>(null);
  /** Con un proyecto existente elegido no se permite crear otro: los campos
   *  de creación quedan deshabilitados. */
  protected readonly inputsLocked = computed(() => this.selectedProjectId() !== null);

  protected readonly form = this.formBuilder.group({
    propertyName: ['', Validators.required],
    location: ['', Validators.required],
    // Puntos fuertes del proyecto: obligatorios — son el insumo de los ángulos.
    description: ['', Validators.required],
    // Cuántos ángulos de venta crear (por defecto 3; 1–10).
    anglesCount: [3, [Validators.min(1), Validators.max(10)]],
  });

  constructor() {
    this.eventsService
      .listEvents()
      .pipe(catchError(() => EMPTY))
      .subscribe((projects) => this.projects.set(projects));

    // Catálogo de modelos para la lógica de cada paso (ratios, payloads): la
    // misma fuente memoizada que alimenta los selectores compartidos.
    this.catalog
      .all()
      .pipe(catchError(() => EMPTY))
      .subscribe((models) => this.models.set(models));

    // Credenciales: aportan el modelo LLM configurado en Admin → Modelos.
    this.agencyService
      .listCredentials()
      .pipe(catchError(() => EMPTY))
      .subscribe((creds) => this.credentials.set(creds ?? []));

    // Writing Copilot: solo aparece en el selector si el back lo tiene activo.
    this.writingCopilot
      .available()
      .pipe(catchError(() => of(false)))
      .subscribe((enabled) => this.writingCopilotAvailable.set(enabled));

    // Al elegir un proyecto existente: se cargan sus datos en el formulario
    // (nombre, ciudad/venue, descripción) y los campos con dato quedan
    // bloqueados — así no se crea otro proyecto, pero los vacíos siguen
    // editables para completar lo que falte (campos obligatorios).
    effect(() => {
      const id = this.selectedProjectId();
      const project = id ? (this.projects().find((p) => p.id === id) ?? null) : null;
      if (project) {
        this.form.patchValue(
          {
            propertyName: project.name ?? '',
            location: project.venue ?? '',
            description: project.description ?? '',
          },
          { emitEvent: false },
        );
      } else if (!id) {
        // Sin proyecto elegido el formulario vuelve a vacío para crear uno nuevo.
        this.form.reset(undefined, { emitEvent: false });
      }
      const raw = this.form.getRawValue() as Record<string, unknown>;
      for (const key of ['propertyName', 'location', 'description'] as const) {
        const control = this.form.get(key);
        if (!control) continue;
        const hasValue = String(raw[key] ?? '').trim() !== '';
        const disable = !!project && hasValue;
        disable ? control.disable({ emitEvent: false }) : control.enable({ emitEvent: false });
      }
      // Recupera el avance guardado del proyecto (fase, modelos, ángulos,
      // storyboard) para no reprocesar lo que ya está hecho.
      //
      // Se restaura SOLO cuando cambia el proyecto elegido: `projects()` se
      // actualiza con cada persistencia y re-ejecutaría este effect, que con el
      // estado viejo pisaba en vivo los tildes del usuario (el botón de
      // "Siguiente" nunca se habilitaba).
      if (project) {
        if (this.restoredProjectId !== id) {
          this.restoredProjectId = id;
          this.restoreWorkflow(project);
        }
      } else if (!id && this.restoredProjectId !== null) {
        this.restoredProjectId = null;
        this.restoreWorkflow(null);
      }
    });
  }

  /** Último proyecto cuyo avance se restauró (guard contra re-restores). */
  private restoredProjectId: string | null | undefined = undefined;

  protected get canProceedToAngles(): boolean {
    // Los tres campos son obligatorios (proyecto elegido o nuevo): sin los
    // datos completos no se pueden generar ángulos de venta.
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const formReady = ['propertyName', 'location', 'description'].every(
      (key) => String(raw[key] ?? '').trim() !== '',
    );
    // El comercial sube fotos antes de generar: el experto necesita el tipo
    // de cada una (`referencias_subidas.funcion`).
    return formReady && (!this.isCommercial() || this.projectPhotosReady());
  }

  /**
   * Avance al paso 2. Generar se puede siempre que el brief esté completo;
   * avanzar, en cambio, espera las imágenes que el experto marcó como
   * imprescindibles (con la salida explícita del usuario).
   */
  protected get canAdvanceToPrompts(): boolean {
    if (!this.canProceedToAngles) return false;
    if (!this.isCommercial()) return true;
    return (
      this.angles().length > 0 &&
      this.projectPhotosReady() &&
      (this.stepPhotosSkipped() || this.pendingStepPhotos().length === 0)
    );
  }

  protected get selectedAnglesCount(): number {
    return this.angles().filter((a) => a.selected).length;
  }

  // ─── Folleto del proyecto (paso 1) ──────────────────────────

  /** True mientras extrae texto de uno o más folletos subidos. */
  protected readonly extractingBrief = signal(false);
  /** Aviso del último folleto cargado (nombre + caracteres). */
  protected readonly briefNote = signal<string | null>(null);

  // ─── Imágenes que el experto pide antes de pasar a los prompts ────────

  /** Fotos de referencia subidas antes de generar: entrada visual del experto
   *  y lo que se adjunta a cada escena (tag `@nombre`). */
  protected readonly projectPhotos = signal<ProjectPhoto[]>([]);
  /** Subida de referencias visuales en curso. */
  protected readonly uploadingProjectPhotos = signal(false);
  /** Tipos del selector de cada foto. */
  protected readonly photoKindOptions = computed(() => {
    this.translate.currentLang();
    const keys: Record<PhotoKind, string> = {
      character: 'P1_PHOTO_KIND_CHARACTER',
      product: 'P1_PHOTO_KIND_PRODUCT',
      location: 'P1_PHOTO_KIND_LOCATION',
      props: 'P1_PHOTO_KIND_PROPS',
    };
    return PHOTO_KINDS.map((kind) => ({
      label: this.translate.instant(`AGENCY.STUDIO.${keys[kind]}`),
      value: kind,
    }));
  });
  /** Sin tipo no se puede armar `referencias_subidas` ni avanzar. */
  protected readonly projectPhotosReady = computed(() =>
    this.projectPhotos().every((photo) => photo.kind !== null),
  );

  /** Tipo de cada foto por tag: pinta los tags del prompt con su color. */
  protected readonly photoKindByTag = computed(() => {
    const kinds = new Map<string, PhotoKind | null>();
    for (const photo of this.projectPhotos()) {
      kinds.set(photo.tag.toLowerCase(), photo.kind);
    }
    return kinds;
  });

  /** `fotos_sugeridas` del paso 1, con lo que el usuario fue subiendo. */
  protected readonly stepPhotos = signal<RequiredPhoto[]>([]);
  /** El usuario decidió seguir sin las imágenes que faltan. */
  protected readonly stepPhotosSkipped = signal(false);
  /** Panel "qué subir" desplegado en el paso 1. */
  protected readonly stepPhotosOpen = signal(false);
  /** Grilla de fotos de referencia del proyecto desplegada. */
  protected readonly projectPhotosOpen = signal(false);
  /** Sugerencias con una subida en curso (spinner del botón). */
  protected readonly uploadingPhotoIds = signal<string[]>([]);

  /** Imprescindibles sin archivo: bloquean el avance al paso 2. */
  protected readonly pendingStepPhotos = computed(() => pendingRequiredPhotos(this.stepPhotos()));

  /** Archivos distintos ya cargados, para el contador del panel. */
  protected readonly stepPhotosCount = computed(() => photoFileCount(this.stepPhotos()));

  /** Sube folletos (PDF/DOCX/TXT/MD), extrae su texto y lo appendee a la
   *  descripción: la información general del proyecto vive en el folleto. */
  protected async onBriefFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (input) input.value = '';
    if (!files.length) return;

    this.extractingBrief.set(true);
    this.error.set(null);
    this.briefNote.set(null);
    try {
      const added: string[] = [];
      let truncated = false;
      for (const file of files) {
        const result = await firstValueFrom(this.agencyService.extractBrief(file));
        if (!result?.text) {
          this.error.set(
            this.translate.instant('AGENCY.STUDIO.ERRORS.EXTRACT', { name: file.name }),
          );
          return;
        }
        this.appendBriefText(result.text);
        added.push(result.filename || file.name);
        truncated = truncated || result.truncated;
      }
      this.briefNote.set(
        this.translate.instant('AGENCY.STUDIO.ERRORS.NOTE_ADDED', { names: added.join(', ') }) +
          (truncated ? this.translate.instant('AGENCY.STUDIO.ERRORS.NOTE_TRUNCATED') : ''),
      );
    } catch (err) {
      // HttpErrorResponse trae el mensaje del back en err.error.message.
      const wrapped = err as { message?: string; error?: { message?: string } };
      const message = wrapped?.error?.message || wrapped?.message || '';
      this.error.set(message || this.translate.instant('AGENCY.STUDIO.ERRORS.EXTRACT_GENERIC'));
    } finally {
      this.extractingBrief.set(false);
    }
  }

  /** Concatena el texto extraído a la descripción (sin pisar lo escrito) y
   *  deja el campo editable aunque viniera bloqueado, para poder revisarlo. */
  private appendBriefText(text: string): void {
    const control = this.form.get('description');
    if (!control) return;
    const current = String(control.value ?? '').trim();
    control.setValue(current ? `${current}\n\n${text}` : text);
    if (control.disabled) control.enable({ emitEvent: false });
    control.markAsDirty();
    control.markAsTouched();
  }

  // ─── Paso 1: imágenes de referencia de los prompts ────────────────────

  /** Fotos de un prompt, en orden de subida y con su tag `@imageN`. */
  protected taggedStepPhotos(promptId: string): TaggedPhoto[] {
    return taggedPhotosForPrompt(this.stepPhotos(), promptId);
  }

  /** Lo que todavía hay que pedirle al usuario para ese prompt. */
  protected missingStepPhotos(promptId: string): RequiredPhoto[] {
    return missingPhotosForPrompt(this.stepPhotos(), promptId);
  }

  // ─── Paso 2: detalle del prompt del experto ──────────────────────────

  /** Plan de escena del prompt (artefacto del paso 1), o null. */
  protected scenePlan(angle: SalesAngle): ScenePromptPlan | null {
    const plan = planScenePrompt(angle.artifact);
    if (!plan) return null;
    const hasContent =
      !!plan.location ||
      plan.characters.length > 0 ||
      !!plan.product ||
      plan.beats.length > 0 ||
      !!plan.camera.mode ||
      !!plan.camera.registro ||
      !!plan.marca;
    return hasContent ? plan : null;
  }

  /** Texto del slot de referencia que el usuario reemplaza por un tag. */
  protected sceneSlotText(slot: ScenePromptSlot): string {
    return this.translate.instant('AGENCY.STUDIO.P2_REF_SLOT', { value: slot.description });
  }

  /** Campo visual listo para el prompt: si ya referencia una foto subida
   *  (`@tag`), se usa tal cual; si no, queda como slot para insertar el tag. */
  protected sceneFieldText(slot: ScenePromptSlot): string {
    return this.hasUploadedTag(slot.description) ? slot.description : this.sceneSlotText(slot);
  }

  private hasUploadedTag(text: string): boolean {
    const uploaded = new Set(this.projectPhotos().map((photo) => photo.tag.toLowerCase()));
    return parseTagsFromText(text).some((tag) => uploaded.has(tag.toLowerCase()));
  }

  /** Color del tipo de recurso (variable CSS del tema). */
  protected kindColor(kind: PhotoKind | null | undefined): string {
    return `var(--color-kind-${kind ?? 'unknown'})`;
  }

  protected photoChipClass(kind: PhotoKind | null, assigned: boolean): string {
    return `photo-chip photo-chip--${kind ?? 'unknown'}${assigned ? ' photo-chip--assigned' : ''}`;
  }

  /** La foto ya está insertada en ESTE prompt. */
  protected isPhotoAssigned(prompt: VideoPrompt, tag: string): boolean {
    return parseTagsFromText(prompt.text).includes(tag.toLowerCase());
  }

  /** Texto del prompt partido en tonos: slots del artefacto y tags `@foto`. */
  protected highlightSegments(
    artifact: ScenePromptArtifact | null | undefined,
    text: string,
  ): PromptSegment[] {
    const plan = planScenePrompt(artifact ?? null);
    const slots: PromptSlotText[] = [];
    if (plan?.location) {
      slots.push({ kind: 'location', value: this.sceneFieldText(plan.location) });
    }
    for (const character of plan?.characters ?? []) {
      slots.push({ kind: 'character', value: this.sceneFieldText(character) });
    }
    if (plan?.product) {
      slots.push({ kind: 'product', value: this.sceneFieldText(plan.product) });
    }
    return highlightPrompt(
      text,
      slots.map((slot) => ({ value: slot.value, tone: slot.kind })),
      this.photoKindByTag(),
    );
  }

  /** Mantiene el <pre> espejo en la misma posición que el textarea. */
  protected syncPromptScroll(input: HTMLTextAreaElement, mirror: HTMLElement): void {
    mirror.scrollTop = input.scrollTop;
    mirror.scrollLeft = input.scrollLeft;
  }

  /** Tag `@imageN` con el que el prompt referencia un archivo subido. */
  protected photoTag(photo: RequiredPhoto, fileId: string): string {
    return this.taggedStepPhotos(photo.promptId).find((item) => item.file.id === fileId)?.tag ?? '';
  }

  /** Prompt al que sirve una sugerencia (el experto puede no precisarlo). */
  protected photoPromptLabel(photo: RequiredPhoto): string {
    const angle = this.angles().find((a) => a.id === photo.promptId);
    return angle?.title || this.translate.instant('AGENCY.STUDIO.P1_PHOTOS_ANY_PROMPT');
  }

  protected photoPriorityLabel(priority: RequiredPhoto['priority']): string {
    return this.translate.instant(`AGENCY.STUDIO.P1_PHOTOS_PRIORITY_${priority.toUpperCase()}`);
  }

  protected isUploadingPhoto(photoId: string): boolean {
    return this.uploadingPhotoIds().includes(photoId);
  }

  /** Sube las imágenes elegidas y las engancha a esa sugerencia. */
  protected onStepPhotoFiles(photoId: string, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (input) input.value = '';
    if (!files.length) return;
    this.uploadingPhotoIds.update((ids) => (ids.includes(photoId) ? ids : [...ids, photoId]));
    let pending = files.length;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      this.uploadingPhotoIds.update((ids) => ids.filter((id) => id !== photoId));
      this.persistWorkflow();
    };
    for (const file of files) {
      this.libraryService
        .uploadFile(file, 'images', this.selectedProjectId() ?? undefined)
        .subscribe({
          next: (asset) => {
            if (asset?.id) {
              this.stepPhotos.update((photos) =>
                addPhotoFiles(photos, photoId, [
                  { id: asset.id, filename: asset.filename, url: asset.url },
                ]),
              );
            }
            done();
          },
          error: () => {
            this.error.set(
              this.translate.instant('AGENCY.STUDIO.ERRORS.UPLOAD', { name: file.name }),
            );
            done();
          },
        });
    }
  }

  protected removeStepPhoto(photoId: string, fileId: string): void {
    this.stepPhotos.update((photos) => removePhotoFile(photos, photoId, fileId));
    this.persistWorkflow();
  }

  // ─── Paso 1: referencias visuales subidas antes de generar ────────────

  /** Sube las fotos de referencia con su tag `@nombre`; el tipo se elige
   *  después en cada miniatura (el experto lo necesita como `funcion`). */
  protected onProjectPhotoFiles(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (input) input.value = '';
    if (!files.length) return;
    this.projectPhotosOpen.set(true);
    this.uploadingProjectPhotos.set(true);
    let pending = files.length;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      this.uploadingProjectPhotos.set(false);
      this.persistWorkflow();
    };
    for (const file of files) {
      const tag = tagFromFilename(
        file.name,
        this.projectPhotos().map((photo) => photo.tag),
      );
      this.libraryService
        .uploadFile(file, 'images', this.selectedProjectId() ?? undefined)
        .subscribe({
          next: (asset) => {
            if (asset?.id) {
              this.projectPhotos.update((photos) => [
                ...photos,
                {
                  id: asset.id,
                  filename: asset.filename ?? file.name,
                  url: asset.url,
                  tag,
                  kind: null,
                },
              ]);
            }
            done();
          },
          error: () => {
            this.error.set(
              this.translate.instant('AGENCY.STUDIO.ERRORS.UPLOAD', { name: file.name }),
            );
            done();
          },
        });
    }
  }

  protected setProjectPhotoKind(fileId: string, kind: PhotoKind): void {
    this.projectPhotos.update((photos) =>
      photos.map((photo) => (photo.id === fileId ? { ...photo, kind } : photo)),
    );
    this.persistWorkflow();
  }

  protected removeProjectPhoto(fileId: string): void {
    this.projectPhotos.update((photos) => photos.filter((photo) => photo.id !== fileId));
    this.persistWorkflow();
  }

  /** Fotos subidas → referencias de la escena (rol = tipo elegido). */
  private referenceImagesFromProjectPhotos(): ReferenceImage[] {
    return this.projectPhotos().map((photo) => ({
      id: photo.id,
      filename: photo.filename,
      url: photo.url,
      role: photo.kind ? photoKindToFuncion(photo.kind) : 'sin_definir',
      note: photo.tag,
      kind: photo.kind ?? undefined,
    }));
  }

  /** `referencias_subidas` del contrato del paso 1: archivo + función. */
  private referenciasSubidas(): { archivo: string; tag: string; descripcion: string; funcion: string }[] {
    const rows = new Map<
      string,
      { archivo: string; tag: string; descripcion: string; funcion: string }
    >();
    for (const photo of this.projectPhotos()) {
      rows.set(photo.id, {
        archivo: photo.filename,
        tag: photo.tag,
        descripcion: '',
        funcion: photo.kind ? photoKindToFuncion(photo.kind) : 'sin_definir',
      });
    }
    for (const photo of this.stepPhotos()) {
      for (const file of photo.files) {
        if (rows.has(file.id)) continue;
        rows.set(file.id, {
          archivo: file.filename,
          tag: tagFromFilename(file.filename, [...rows.values()].map((row) => row.tag)),
          descripcion: photo.description,
          funcion: photoKindFromSuggestion(photo.type) ?? photo.type,
        });
      }
    }
    return [...rows.values()];
  }

  /** Referencias de una escena: las fotos subidas en el paso 1 (con su tag)
   *  más lo cargado en las sugerencias del experto, sin repetir archivo. */
  private referencesForScene(promptId: string): ReferenceImage[] {
    const byId = new Map<string, ReferenceImage>();
    for (const ref of this.referenceImagesFromProjectPhotos()) byId.set(ref.id, ref);
    for (const ref of referenceImagesForPrompt(this.stepPhotos(), promptId)) {
      if (!byId.has(ref.id)) byId.set(ref.id, ref);
    }
    return [...byId.values()];
  }

  /** Escape explícito: seguir a los prompts sin las imágenes que faltan. */
  protected skipStepPhotos(): void {
    this.stepPhotosSkipped.set(true);
    this.persistWorkflow();
  }

  protected get canProceedToStoryboard(): boolean {
    return this.selectedAnglesCount > 0;
  }

  /** Todas las escenas tienen su hoja de storyboard cargada y aprobada:
   *  es la condición para entrar al paso Escenas. El comercial no genera
   *  hojas: con sus escenas armadas ya puede filmar. */
  protected get canProceedToScenes(): boolean {
    const scenes = this.storyboard();
    if (scenes.length === 0) return false;
    if (this.isCommercial()) return true;
    return scenes.every((s) => !!s.boardImageUrl && !!s.approved);
  }

  /** Escenas sin storyboard aprobado (o sin imagen cargada). */
  protected get pendingApprovals(): number {
    return this.storyboard().filter((s) => !s.boardImageUrl || !s.approved).length;
  }

  protected goToPhase(phase: WorkflowPhase): void {
    if (!this.canEnterPhase(phase)) {
      this.error.set(this.phaseBlockedMessage(phase));
      return;
    }
    this.error.set(null);
    this.currentPhase.set(phase);
    if (phase === 'scenes') this.ensureVideoPrompts();
    this.focusPhaseHeading();
  }

  /** El stepper no salta gates: solo se entra a un paso si su condición
   *  se cumple (vale para clicks en el stepper y para el avance lineal). */
  private canEnterPhase(phase: WorkflowPhase): boolean {
    switch (phase) {
      case 'input':
        return true;
      case 'angles':
        return this.canAdvanceToPrompts;
      case 'storyboard':
        // El comercial no tiene este paso: la lista de fases ya lo excluye.
        return !this.isCommercial() && this.canProceedToStoryboard;
      case 'scenes':
        return this.canProceedToScenes;
    }
  }

  private phaseBlockedMessage(phase: WorkflowPhase): string {
    switch (phase) {
      case 'angles':
        return this.translate.instant('AGENCY.STUDIO.ERRORS.ANGLES_BLOCKED');
      case 'storyboard':
        return this.translate.instant('AGENCY.STUDIO.ERRORS.STORYBOARD_BLOCKED');
      case 'scenes':
        return this.translate.instant('AGENCY.STUDIO.ERRORS.SCENES_BLOCKED');
      default:
        return '';
    }
  }

  /** Tras cambiar de paso, lleva el foco al título: teclado y lector
   *  arrancan en el contenido nuevo. Corre solo en browser (afterNextRender
   *  no se ejecuta en SSR) y después del render, cuando el título ya existe. */
  private focusPhaseHeading(): void {
    afterNextRender(() => {
      document.querySelector<HTMLElement>('#agency-phase-heading')?.focus();
    });
  }

  protected nextPhase(): void {
    // Las fases dependen del experto: el comercial salta Storyboard.
    const phases = this.phases().map((phase) => phase.key);
    const currentIndex = phases.indexOf(this.currentPhase());
    if (currentIndex < 0 || currentIndex >= phases.length - 1) return;
    const next = phases[currentIndex + 1];
    if (next === 'scenes' && !this.canProceedToScenes) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.SCENES_BLOCKED'));
      return;
    }
    this.currentPhase.set(next);
    if (next === 'scenes') this.ensureVideoPrompts();
    this.focusPhaseHeading();
    // Cada avance se guarda en el proyecto (evita reprocesos).
    this.persistWorkflow();
  }

  protected prevPhase(): void {
    const phases = this.phases().map((phase) => phase.key);
    const currentIndex = phases.indexOf(this.currentPhase());
    if (currentIndex > 0) {
      this.currentPhase.set(phases[currentIndex - 1]);
      this.focusPhaseHeading();
    }
  }

  protected toggleAngle(angleId: string): void {
    this.angles.update((angles) =>
      angles.map((a) => (a.id === angleId ? { ...a, selected: !a.selected } : a)),
    );
    // La selección se guarda en el proyecto: si no, al volver a entrar se
    // pierde y el restore trae los tildes viejos.
    this.persistWorkflow();
  }

  /** Click sobre la card de un ángulo (mouse/touch): alterna el tildado,
   *  salvo que el evento nazca en un control real (checkbox, título,
   *  descripción), que se maneja solo. El teclado usa el checkbox. */
  protected onAngleCardActivate(angleId: string, event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, button, label, [contenteditable="true"]'))
      return;
    this.toggleAngle(angleId);
  }

  protected generateAngles(): void {
    this.submitted.update((v) => v + 1);
    if (!this.canProceedToAngles) {
      this.form.markAllAsTouched();
      return;
    }

    const chosenId = this.selectedProjectId();
    const raw = this.form.getRawValue() as {
      propertyName: string;
      location: string;
      description: string;
    };
    const values = {
      name: raw.propertyName.trim(),
      venue: raw.location.trim(),
      description: raw.description.trim(),
    };
    this.projectDescription.set(`${values.name} en ${values.venue}. ${values.description}`);
    // Inmobiliaria y comercial piden un número fijo (ángulos o escenas del
    // spot); el de cine deja que el experto defina cuántos necesita (tope 10
    // para no recortar su respuesta).
    const fixed = this.agent() === 'real_estate' || this.agent() === 'commercial';
    const count = fixed
      ? Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3
      : 10;
    this.angles.set(this.buildAngles(count));

    this.loading.set(true);
    this.error.set(null);
    // Cada generación trae su propia lista de imágenes a pedir: la salida de
    // emergencia del usuario se rearma (lo ya subido se conserva por fila).
    this.stepPhotosSkipped.set(false);

    // Proyecto elegido → actualiza sus datos; si no, crea (o reutiliza y
    // completa los datos de) el proyecto con el mismo nombre.
    const anchor$: Observable<Project> = chosenId
      ? this.eventsService.updateEvent(chosenId, values)
      : this.ensureProjectAnchor(values);

    anchor$
      .pipe(
        mergeMap((project) => {
          // Proyecto creado/actualizado a cargo del workflow.
          this.selectedProjectId.set(project.id);
          this.projects.update((list) =>
            list.some((p) => p.id === project.id) ? list : [...list, project],
          );
          // Ángulos: modelo LLM elegido en el paso 1 (sin plantillas:
          // si falla, queda el error en el paso 1 y no se avanza).
          return this.generateAnglesWithAgent(count);
        }),
        catchError((err: unknown) => {
          // Sin ángulos falsos: se limpia lo que se hubiera pre-cargado y
          // se muestra el motivo real (agente, LLM o credencial).
          this.angles.set([]);
          const why =
            err instanceof Error && err.message
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.SAVE_PROJECT');
          this.error.set(why);
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((anglesList) => {
        this.angles.set(anglesList);
        if (this.isCommercial() && this.stepPhotos().length > 0) {
          // El experto pidió imágenes para los prompts: se resuelven acá,
          // en el paso 1, y recién después se avanza (los prompts del paso 2
          // salen con esas imágenes tagueadas).
          this.stepPhotosOpen.set(true);
          this.error.set(null);
          this.persistWorkflow();
          return;
        }
        // Tanto al crear uno nuevo como al elegir uno existente se avanza
        // directo a la creación de ángulos de venta.
        this.currentPhase.set('angles');
        this.persistWorkflow();
      });
  }

  /** Busca el proyecto por nombre; si no existe lo crea, y si existe le
   *  completa/actualiza ciudad y descripción (los campos obligatorios). */
  private ensureProjectAnchor(values: {
    name: string;
    venue: string;
    description: string;
  }): Observable<Project> {
    if (!values.name) {
      return throwError(() => new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.EMPTY_NAME')));
    }
    return this.eventsService.listEvents().pipe(
      mergeMap((projects) => {
        const existing = projects.find((p) => p.name === values.name);
        if (!existing) {
          return this.eventsService.createEvent(values);
        }
        const needsUpdate =
          (existing.venue ?? '') !== values.venue ||
          (existing.description ?? '') !== values.description;
        return needsUpdate
          ? this.eventsService.updateEvent(existing.id, {
              venue: values.venue,
              description: values.description,
            })
          : of(existing);
      }),
    );
  }

  /** Escena con borrado pendiente de confirmación (doble paso anti-clicks). */
  protected readonly pendingDeleteSceneId = signal<string | null>(null);

  protected armRemoveScene(sceneId: string): void {
    this.pendingDeleteSceneId.set(sceneId);
  }

  protected cancelRemoveScene(): void {
    this.pendingDeleteSceneId.set(null);
  }

  /** Elimina una escena y renumera las restantes. Si su modal de storyboard
   *  estaba abierta, se cierra. */
  protected removeScene(sceneId: string): void {
    this.pendingDeleteSceneId.set(null);
    this.storyboard.update((scenes) => this.renumberScenes(scenes.filter((s) => s.id !== sceneId)));
    if (this.boardSceneId() === sceneId) this.closeBoardDialog();
    this.persistWorkflow();
  }

  /** Renumera las escenas en orden (1..N): solo reescribe el prefijo
   *  "Escena N:"; los títulos personalizados no se tocan. */
  private renumberScenes(scenes: StoryboardScene[]): StoryboardScene[] {
    return scenes.map((scene, n) => ({
      ...scene,
      title: scene.title.replace(/^Escena \d+:/, `Escena ${n + 1}:`),
    }));
  }

  /** Avanza al paso Storyboard (o directo a Escenas en el comercial):
   *  conserva las escenas ya armadas (con sus fotos, hojas y aprobaciones) y
   *  solo crea las escenas de los ángulos nuevos. Así volver atrás y pulsar
   *  Siguiente no revive escenas eliminadas ni pisa el avance. */
  protected generateStoryboard(): void {
    const selectedAngles = this.angles().filter((a) => a.selected);
    const previous = this.storyboard();
    const scenes = this.isCommercial()
      ? selectedAngles.map((angle) => this.sceneForPrompt(angle, previous))
      : selectedAngles.flatMap((angle) => this.scenesForAngle(angle, previous));
    this.storyboard.set(this.renumberScenes(scenes));
    this.nextPhase();
  }

  /**
   * Escena del comercial publicitario: el prompt del paso 1 ya es una escena
   * filmable del spot, así que no pasa por la hoja de storyboard. Las fotos
   * subidas en el paso 1 quedan como referencias visuales del video (con su
   * tag) y no hay aprobación intermedia que pedir.
   */
  private sceneForPrompt(angle: SalesAngle, previous: StoryboardScene[]): StoryboardScene {
    const kept = previous.find((s) => s.angleId === angle.id);
    const references = this.referencesForScene(angle.id);
    if (kept) {
      // Lo ya generado (prompts, videos, tomas) no se pisa: solo se refresca
      // el texto del prompt y las imágenes del paso 1.
      return {
        ...kept,
        angleTitle: angle.title,
        title: angle.title,
        description: angle.description,
        references,
        refsApproved: true,
        sceneArtifact: angle.artifact ?? null,
      };
    }
    return {
      id: `scene-${angle.id}`,
      angleId: angle.id,
      angleTitle: angle.title,
      title: angle.title,
      description: angle.description,
      references,
      refsApproved: true,
      sceneArtifact: angle.artifact ?? null,
      shots: [],
    };
  }

  /** Escenas de un ángulo: las ya existentes se conservan (se actualiza el
   *  título del ángulo por si se editó); los ángulos nuevos arrancan con
   *  las dos escenas plantilla. */
  private scenesForAngle(angle: SalesAngle, previous: StoryboardScene[]): StoryboardScene[] {
    const kept = previous.filter((s) => s.angleId === angle.id);
    if (kept.length > 0) {
      return kept.map((s) =>
        s.angleTitle === angle.title ? s : { ...s, angleTitle: angle.title },
      );
    }
    return [
      {
        id: `scene-${angle.id}-1`,
        angleId: angle.id,
        angleTitle: angle.title,
        title: `Escena 0: ${angle.title}`,
        description: `Plano general del proyecto destacando ${angle.description.toLowerCase()}`,
        references: [],
        refsApproved: false,
        shots: [
          {
            id: `shot-${angle.id}-1-1`,
            description: 'Plano general — fachada principal al atardecer',
            imageUrl: null,
            generating: false,
          },
          {
            id: `shot-${angle.id}-1-2`,
            description: 'Plano medio — lobby y áreas comunes',
            imageUrl: null,
            generating: false,
          },
        ],
      },
      {
        id: `scene-${angle.id}-2`,
        angleId: angle.id,
        angleTitle: angle.title,
        title: 'Escena 0: Detalle',
        description: `Primer plano de acabados y acabados premium del ${angle.title}`,
        references: [],
        refsApproved: false,
        shots: [
          {
            id: `shot-${angle.id}-2-1`,
            description: 'Primer plano — acabados de cocina',
            imageUrl: null,
            generating: false,
          },
        ],
      },
    ];
  }

  // ─── Storyboard: modal de viñetas + aprobación ─────────────────────

  /** Abre la modal de storyboard de una escena con la sugerencia de tomas
   *  (por lo general una toma por viñeta) y el prompt armado. */
  protected openBoardDialog(sceneId: string): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene || scene.boardGenerating) return;
    if (!scene.refsApproved) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.APPROVE_REFS'));
      return;
    }
    const count = Math.min(Math.max(scene.shots.length || 3, 1), 12);
    const options = this.imageRatioOptions();
    this.boardSceneId.set(sceneId);
    this.boardShotCount.set(count);
    if (!options.some((o) => o.value === this.boardRatio())) {
      this.boardRatio.set(options[0]?.value ?? '');
    }
    this.boardPromptEdited.set(false);
    const suggested = scene.boardArtifact?.prompt_hoja_storyboard?.trim();
    this.boardPrompt.set(suggested || this.buildBoardPrompt(scene, count));
    this.error.set(null);
    this.boardVisible.set(true);
    // La hoja la escribe el experto a partir del ángulo y las referencias.
    // Si todavía no hay artefacto, se pide al abrir en vez de dejar la
    // plantilla genérica como prompt final.
    if (!suggested) this.suggestBoardFromAgent();
  }

  protected closeBoardDialog(): void {
    if (this.boardScene()?.boardGenerating) return;
    this.boardVisible.set(false);
    this.boardSceneId.set(null);
  }

  /** Cambia la cantidad de viñetas sugerida; si el prompt no se editó a mano
   *  se reconstruye para reflejarla. */
  protected onBoardShotCountChange(value: number | null): void {
    const count = Math.min(Math.max(Math.round(value ?? 1), 1), 12);
    this.boardShotCount.set(count);
    const scene = this.boardScene();
    if (scene && !this.boardPromptEdited()) {
      this.boardPrompt.set(this.buildBoardPrompt(scene, count));
    }
  }

  protected onBoardPromptChange(value: string): void {
    this.boardPrompt.set(value);
    this.boardPromptEdited.set(true);
  }

  // ─── Artefactos de los pasos 2 y 3 (storyboard / clip_prompt) ──────

  /** Turno de artefacto del back para los pasos 2 y 3: pide `kind` con el
   *  `payload` dado y emite `artifact` (viaja a onArtifact), `questions`
   *  (al chat del asistente) y `error`. */
  private requestArtifactTurn(
    kind: string,
    payload: Record<string, unknown>,
    onArtifact: (data: Record<string, unknown>) => void,
  ): Observable<void> {
    return this.pickLlmCredential().pipe(
      mergeMap((cred) => {
        const token = this.session.token();
        const controller = new AbortController();
        // Igual que el paso 1: tools + un reintento de corrección en el
        // back pueden alargar el turno.
        const timer = setTimeout(() => controller.abort(), 120_000);
        return new Observable<void>((subscriber) => {
          fetch(this.agentChatUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              conversation_id: this.conversationId(),
              message: `Paso del flujo: ${kind}.`,
              provider: cred.provider,
              workflow: this.agent(),
              artifact: kind,
              payload,
              ...(this.modelText() ? { model: this.modelForProvider(cred.provider) } : {}),
            }),
            signal: controller.signal,
          })
            .then(async (res) => {
              if (!res.ok || !res.body) {
                const detail = await res.text().catch(() => '');
                throw new Error(
                  detail
                    ? `HTTP ${res.status}: ${detail.slice(0, 240)}`
                    : `agent chat HTTP ${res.status}`,
                );
              }
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() ?? '';
                for (const rawEvent of events) {
                  const parsed = parseAgentEvent(rawEvent);
                  if (!parsed) continue;
                  if (parsed.name === 'meta') {
                    const conv = parsed.data['conversation_id'];
                    if (typeof conv === 'string') this.setConversationId(conv);
                  } else if (parsed.name === 'questions') {
                    controller.abort();
                    const questions = Array.isArray(parsed.data['questions'])
                      ? (parsed.data['questions'] as unknown[]).filter(
                          (q): q is string => typeof q === 'string' && q.trim() !== '',
                        )
                      : [];
                    this.noteQuestions(questions);
                    throw new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.QUESTIONS'));
                  } else if (parsed.name === 'artifact') {
                    const data = (parsed.data['data'] ?? {}) as Record<string, unknown>;
                    controller.abort();
                    onArtifact(data);
                    subscriber.next();
                    subscriber.complete();
                    return;
                  } else if (parsed.name === 'error') {
                    throw new Error(
                      String(
                        parsed.data['message'] ??
                          this.translate.instant('AGENCY.STUDIO.ERRORS.AGENT_ERROR'),
                      ),
                    );
                  }
                }
              }
              throw new Error(`sin artefacto ${kind} en la respuesta`);
            })
            .catch((err: unknown) => {
              const why =
                err instanceof Error && err.message
                  ? err.message
                  : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE');
              subscriber.error(
                new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.AGENT_TURN', { why })),
              );
            })
            .finally(() => clearTimeout(timer));
        });
      }),
    );
  }

  /** Pide al experto las viñetas y el prompt de la hoja de la escena
   *  abierta (artefacto storyboard). El prompt sugerido pisa el de
   *  plantilla salvo que el usuario lo haya editado a mano; las viñetas
   *  reordenan las tomas pendientes (las ya generadas no se tocan). */
  protected suggestBoardFromAgent(): void {
    const scene = this.boardScene();
    if (!scene || this.boardAgentLoading()) return;
    const angle = this.angles().find((a) => a.id === scene.angleId);
    const suggestions = this.sceneSuggestions(scene.id);
    const references = (scene.references ?? []).map((r, i) => {
      const descripcion = (r.note || suggestions[i] || '').trim();
      return {
        tag: `@image${i + 1}`,
        archivo: r.filename,
        descripcion,
        funcion: r.role || 'sin_definir',
      };
    });
    const payload: Record<string, unknown> = {
      prompt: {
        id: scene.id,
        titulo: scene.title,
        resumen_para_usuario: scene.description,
        angulo: {
          id: scene.angleId ?? '',
          titulo: angle?.title ?? scene.angleTitle ?? '',
          promesa: angle?.description ?? scene.description,
          virtudes_agrupadas: [],
        },
      },
      referencias: references,
      fotos_subidas: references.map((r) => ({
        nombre: r.archivo,
        descripcion: r.descripcion,
      })),
      cantidad_vinetas: this.boardShotCount(),
      duracion_total_s: this.videoDuration(),
      aspecto: this.boardRatio() || this.videoRatio(),
      duracion_minima_vineta_s: 1.5,
    };
    this.boardAgentLoading.set(true);
    this.error.set(null);
    this.requestArtifactTurn('storyboard', payload, (data) =>
      this.applyBoardArtifact(scene.id, data),
    )
      .pipe(finalize(() => this.boardAgentLoading.set(false)))
      .subscribe({
        error: (err: unknown) =>
          this.error.set(
            err instanceof Error
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE'),
          ),
      });
  }

  private applyBoardArtifact(sceneId: string, data: Record<string, unknown>): void {
    const raw = Array.isArray(data['vinetas'])
      ? (data['vinetas'] as Record<string, unknown>[])
      : [];
    const artifact: StoryboardArtifact = {
      vinetas: raw.map((v) => ({
        n: typeof v['n'] === 'number' ? v['n'] : undefined,
        tipo_toma: typeof v['tipo_toma'] === 'string' ? v['tipo_toma'] : '',
        que_se_ve: typeof v['que_se_ve'] === 'string' ? v['que_se_ve'] : '',
        duracion_s: typeof v['duracion_s'] === 'number' ? v['duracion_s'] : undefined,
        foto_referencia:
          typeof v['foto_referencia'] === 'string' ? v['foto_referencia'] : undefined,
        movimiento_camara:
          typeof v['movimiento_camara'] === 'string' ? v['movimiento_camara'] : undefined,
        funcion: typeof v['funcion'] === 'string' ? v['funcion'] : undefined,
        importancia: typeof v['importancia'] === 'string' ? v['importancia'] : undefined,
      })),
      prompt_hoja_storyboard:
        typeof data['prompt_hoja_storyboard'] === 'string' ? data['prompt_hoja_storyboard'] : '',
      fotos_faltantes: Array.isArray(data['fotos_faltantes'])
        ? (data['fotos_faltantes'] as unknown[]).filter(
            (f): f is string => typeof f === 'string' && f.trim() !== '',
          )
        : [],
    };
    this.storyboard.update((scenes) =>
      scenes.map((s) => {
        if (s.id !== sceneId) return s;
        // Una toma por viñeta; las tomas con imagen ya generada no se
        // reescriben (el dibujo real manda sobre la sugerencia).
        const shots = this.resizeShots(s, Math.max(artifact.vinetas.length, 1)).map((sh, i) => {
          const v = artifact.vinetas[i];
          if (!v || sh.imageUrl) return sh;
          const desc = [v.tipo_toma, v.que_se_ve]
            .filter((p): p is string => !!p && p.trim() !== '')
            .join(' — ');
          return desc ? { ...sh, description: desc } : sh;
        });
        return { ...s, boardArtifact: artifact, shots };
      }),
    );
    if (artifact.vinetas.length > 0) {
      this.boardShotCount.set(Math.min(Math.max(artifact.vinetas.length, 1), 12));
    }
    if (!this.boardPromptEdited() && artifact.prompt_hoja_storyboard) {
      this.boardPrompt.set(artifact.prompt_hoja_storyboard);
    }
    this.persistWorkflow();
  }

  /** Pide al experto el prompt final del clip de una escena (artefacto
   *  clip_prompt): el texto creativo con tiempos y bloques reemplaza al de
   *  plantilla en los prompts de escena (las tomas siguen con su plantilla). */
  protected suggestPromptsFromAgent(scene: StoryboardScene): void {
    if (this.clipAgentSceneId()) return;
    const hasBoard = !!(scene.boardFileId || scene.boardImageUrl);
    const vinetas = this.sceneClipVinetas(scene);
    const total = this.videoDuration();
    const payload: Record<string, unknown> = {
      prompt: {
        id: scene.id,
        titulo: scene.title,
        resumen_para_usuario: scene.description,
        ...(scene.angleTitle ? { angulo: scene.angleTitle } : {}),
      },
      escena: {
        numero: Math.max(this.storyboard().findIndex((s) => s.id === scene.id), 0) + 1,
        titulo: scene.title,
      },
      vinetas,
      cantidad_vinetas: vinetas.length,
      // La duración se reparte en partes iguales entre las viñetas.
      duracion_por_vineta_s: vinetas.length
        ? Math.round((total / vinetas.length) * 100) / 100
        : total,
      referencias: [
        ...(hasBoard ? [{ tag: '@image1', archivo: 'storyboard.jpg', tipo: 'storyboard' }] : []),
        ...(scene.references ?? []).map((r, i) => ({
          tag: `@image${i + (hasBoard ? 2 : 1)}`,
          archivo: r.filename,
          tipo: 'foto_real',
        })),
      ],
      modelo_video: this.modelVideo(),
      duracion_total_s: this.videoDuration(),
      aspecto: this.videoRatio(),
      resolucion: this.videoResolution(),
      sonido: this.videoAudio(),
    };
    this.clipAgentSceneId.set(scene.id);
    this.error.set(null);
    this.requestArtifactTurn('clip_prompt', payload, (data) =>
      this.applyClipArtifact(scene.id, data),
    )
      .pipe(finalize(() => this.clipAgentSceneId.set(null)))
      .subscribe({
        error: (err: unknown) =>
          this.error.set(
            err instanceof Error
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE'),
          ),
      });
  }

  private applyClipArtifact(sceneId: string, data: Record<string, unknown>): void {
    const notas = data['notas_editor'];
    const artifact: ClipArtifact = {
      prompt_video: typeof data['prompt_video'] === 'string' ? data['prompt_video'] : '',
      notas_editor: notas && typeof notas === 'object' ? (notas as Record<string, unknown>) : {},
    };
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, clipArtifact: artifact } : s)),
    );
    if (artifact.prompt_video) {
      // Rearma los prompts de escena con el texto del experto como base.
      this.generatePrompts();
    }
  }

  /** Notas para el editor del artefacto clip_prompt (par clave-valor). */
  protected editorNotes(scene: StoryboardScene): { key: string; value: string }[] {
    const notas = scene.clipArtifact?.notas_editor;
    if (!notas) return [];
    return Object.entries(notas)
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      .map(([key, value]) => ({ key, value: String(value) }));
  }

  /** Líneas `@imageN` de las referencias de la escena, contando la hoja de
   *  storyboard como `@image1` cuando existe: el mismo número que se lee en
   *  el paso 2 y el que viaja al modelo. */
  private sceneReferenceTagLines(scene: StoryboardScene): string[] {
    const refs = this.referencesOfScene(scene.id).filter((ref) => ref.id !== scene.boardFileId);
    return referenceTagLines({ board: !!scene.boardFileId, references: refs });
  }

  /** Narrativa de las fotos reales subidas para el ángulo de la escena:
   *  con esos datos se describe qué elementos reales debe integrar el dibujo
   *  del storyboard y cada toma del video. */
  private referenceNarrative(scene: StoryboardScene): string | null {
    if (!scene.references?.length) return null;
    const items = this.sceneSuggestions(scene.id);
    const files = scene.references.map((r) => r.filename).join(', ');
    return `Fotos reales asignadas a la escena (${files}): ${items.join(', ')}. Integrar esos elementos en la acción y respetar su apariencia.`;
  }

  /** Prompt de respaldo de la hoja: secuencia visual limpia, sin texto
   *  dibujado. El experto lo reemplaza con su `prompt_hoja_storyboard`. */
  private buildBoardPrompt(scene: StoryboardScene, tomas: number): string {
    const shots = Array.from({ length: tomas }, (_, i) => {
      const shot = scene.shots[i];
      const desc = shot?.description?.trim() || scene.title;
      return `Viñeta ${i + 1}: ${desc}.`;
    });
    const references = this.boardReferenceLines(scene);
    const lines = [
      `Secuencia visual para materializar el ángulo de venta "${scene.angleTitle || scene.title}": ${scene.description}`,
      ...shots,
    ];
    if (references.length) {
      lines.push(
        `Usar como verdad visual las imágenes de referencia adjuntas: ${references.join('; ')}. No inventar arquitectura, materiales ni mobiliario.`,
      );
    }
    return lines.join(' ');
  }

  /** Referencias de la hoja con el mismo orden en que se adjuntan al modelo. */
  private boardReferenceLines(scene: StoryboardScene): string[] {
    const suggestions = this.sceneSuggestions(scene.id);
    return (scene.references ?? []).map((ref, i) => {
      const desc = [ref.role, ref.note || suggestions[i]]
        .filter((part): part is string => !!part && part !== 'sin_definir')
        .join(' — ');
      return `Referencia ${i + 1} (${ref.filename}${desc ? `: ${desc}` : ''})`;
    });
  }

  /** Genera la imagen-guía (hoja con varias viñetas) de la escena abierta. */
  protected submitBoardImage(): void {
    const scene = this.boardScene();
    const prompt = this.boardPrompt().trim();
    if (!scene || scene.boardGenerating) return;
    if (!prompt) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.BOARD_PROMPT'));
      return;
    }
    const imageModels = this.models().filter((m) => m.modality === 'image');
    const model = imageModels.find((m) => m.name === this.modelImage()) ?? imageModels[0];
    if (!model) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_IMAGE_MODELS'));
      return;
    }
    const count = this.boardShotCount();
    const ratio = this.boardRatio();
    // Las fotos reales son la verdad visual de la constructora: la hoja las
    // recibe como input_references, no solo como texto en el prompt. El
    // texto lleva la directiva del motor (ADN visual, estilo, cuadrícula y
    // manifiesto) alrededor de los beats que ve y edita el usuario.
    const references = (scene.references ?? []).slice(0, 16);
    const content: ContentItem[] = [
      {
        type: 'text',
        text: composeBoardSheetPrompt({
          agent: this.agent(),
          beats: prompt,
          count,
          ratio,
          references,
          descriptions: this.sceneSuggestions(scene.id),
        }),
      },
    ];
    for (const ref of references) {
      content.push({ type: 'image', id: ref.id, name: ref.filename });
    }
    const setGenerating = (generating: boolean, patch: Partial<StoryboardScene> = {}) =>
      this.storyboard.update((scenes) =>
        scenes.map((s) =>
          s.id === scene.id ? { ...s, boardGenerating: generating, ...patch } : s,
        ),
      );

    // La cantidad de tomas de la modal manda sobre la lista de tomas.
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === scene.id ? { ...s, shots: this.resizeShots(s, count) } : s)),
    );
    setGenerating(true);
    this.error.set(null);
    // Auto-abre el popover del paso 3 con la cola de generación en curso.
    this.showBoardReel();

    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.PREPARE_PROJECT'));
          setGenerating(false);
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        this.agencyService
          .generate('image', {
            model: model.name,
            content,
            ...(ratio ? { ratio } : {}),
            event_id: project.id,
            piece_id: piece.id,
            piece_code: piece.piece_code ?? `SCENE-${scene.id.toUpperCase()}`,
            generation_number: 1,
          })
          .pipe(
            catchError(() => {
              this.error.set(
                this.translate.instant('AGENCY.STUDIO.ERRORS.BOARD_GENERATE', {
                  title: scene.title,
                }),
              );
              setGenerating(false);
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.agencyService
              .pollTaskUntilDone('image', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(
                    this.translate.instant('AGENCY.STUDIO.ERRORS.BOARD_POLL', {
                      title: scene.title,
                    }),
                  );
                  setGenerating(false);
                  return EMPTY;
                }),
              )
              .subscribe((status: StatusResponse) => {
                const url =
                  status.status === 'succeeded' && status.outputs?.[0]?.url
                    ? status.outputs[0].url
                    : null;
                if (!url) {
                  this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.BOARD_NO_OUTPUT'));
                  setGenerating(false);
                  return;
                }
                // Imagen nueva → la aprobación vuelve a pendiente.
                setGenerating(false, { boardImageUrl: url, approved: false });
                this.boardVisible.set(false);
                this.boardSceneId.set(null);
                this.persistWorkflow();
                void this.uploadBoardReference(scene.id, url);
              });
          });
      });
  }

  /** Ajusta la lista de tomas de la escena a la cantidad pedida en la modal. */
  private resizeShots(scene: StoryboardScene, count: number): StoryboardShot[] {
    const shots = scene.shots.slice(0, count);
    for (let i = scene.shots.length; i < count; i++) {
      shots.push({
        id: `${scene.id}-shot-${i + 1}`,
        description: `Toma ${i + 1} — ${scene.title}`,
        imageUrl: null,
        generating: false,
      });
    }
    return shots;
  }

  /** Sube la hoja generada al store para adjuntarla como imagen de referencia
   *  de los videos. Si falla (CORS/URL expirada) el flujo sigue: el prompt
   *  queda igual, sólo se pierde la referencia adjunta.
   *  Devuelve el file id subido (o null si falló). */
  private async uploadBoardReference(sceneId: string, url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const ext = blob.type.includes('png') ? 'png' : 'jpg';
      const file = new File([blob], `storyboard-${sceneId}.${ext}`, {
        type: blob.type || 'image/png',
      });
      const asset = await firstValueFrom(
        this.libraryService.uploadFile(file, 'images', this.selectedProjectId() ?? undefined),
      );
      if (!asset?.id) return null;
      this.rememberBoardFile(sceneId, asset.id);
      return asset.id;
    } catch {
      return null;
    }
  }

  /** Guarda el file id de la hoja de storyboard en la escena y persiste. */
  private rememberBoardFile(sceneId: string, fileId: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, boardFileId: fileId } : s)),
    );
    this.persistWorkflow();
  }

  /** Abre la modal "Editar elemento" para la HOJA de storyboard: usa el file
   *  id guardado o, si el workflow no lo tiene (datos viejos / upload
   *  fallido), resuelve el archivo en la biblioteca por nombre y, si no
   *  existe, lo sube desde la URL renderizada antes de abrir la modal. */
  protected openBoardAssetEditor(scene: StoryboardScene): void {
    if (scene.boardFileId) {
      this.openAssetEditor(scene.boardFileId);
      return;
    }
    if (!scene.boardImageUrl || this.editorLoading() || this.editorVisible()) {
      return;
    }
    this.editorLoading.set(true);
    const nameQuery = `storyboard-${scene.id}`;
    this.libraryService
      .listFilesPaginated({ page: 1, pageSize: 10, q: nameQuery })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        const found = (res?.items ?? []).find((f) => f.filename?.startsWith(`${nameQuery}.`));
        if (found) {
          this.rememberBoardFile(scene.id, found.id);
          this.editorLoading.set(false);
          this.openAssetEditor(found.id);
          return;
        }
        void this.uploadBoardReference(scene.id, scene.boardImageUrl!).then((fileId) => {
          this.editorLoading.set(false);
          if (!fileId) {
            this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.BOARD_LOAD'));
            return;
          }
          this.openAssetEditor(fileId);
        });
      });
  }

  /** Aprueba/desaprueba el storyboard de una escena (requiere imagen cargada). */
  protected toggleApproveScene(sceneId: string): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene?.boardImageUrl) return;
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, approved: !s.approved } : s)),
    );
    this.persistWorkflow();
  }

  /** Habilita "Aprobar todas": hay escenas, todas tienen hoja cargada y
   *  al menos una sigue sin aprobar. */
  protected get canApproveAll(): boolean {
    const scenes = this.storyboard();
    return (
      scenes.length > 0 && scenes.every((s) => !!s.boardImageUrl) && scenes.some((s) => !s.approved)
    );
  }

  /** Aprueba de una vez todas las escenas con hoja cargada. */
  protected approveAllScenes(): void {
    if (!this.canApproveAll) return;
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.boardImageUrl ? { ...s, approved: true } : s)),
    );
    this.persistWorkflow();
  }

  protected updateShotDescription(sceneId: string, shotId: string, value: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, description: value } : sh)),
            }
          : s,
      ),
    );
  }

  /**
   * Resuelve el proyecto/pieza real para una escena: usa el proyecto elegido
   * en el formulario, o crea/reautiliza uno llamado como el proyecto cargado
   * ("Agencia <nombre>") para que los recursos queden centralizados.
   */
  private ensureSceneAnchor(
    scene: StoryboardScene,
  ): Observable<{ project: Project; piece: Piece }> {
    const chosenId = this.selectedProjectId();
    const anchorName = chosenId
      ? (this.projects().find((p) => p.id === chosenId)?.name ?? 'Agencia')
      : this.form.getRawValue().propertyName || 'Agencia';
    return this.eventsService.listEvents().pipe(
      mergeMap((projects) => {
        const existing = chosenId
          ? projects.find((p) => p.id === chosenId)
          : projects.find((p) => p.name === anchorName);
        return existing ? of(existing) : this.eventsService.createEvent({ name: anchorName });
      }),
      mergeMap((project) =>
        this.eventsService.listPieces({ event_id: project.id }).pipe(
          mergeMap((pieces) => {
            const pieceCode = `SCENE-${scene.id.toUpperCase()}`;
            const existing = pieces.find((p) => p.piece_code === pieceCode);
            return existing
              ? of({ project, piece: existing })
              : this.eventsService
                  .createPiece(project.id, {
                    number: pieces.length + 1,
                    piece_code: pieceCode,
                    name: scene.title,
                    type: 'image',
                  })
                  .pipe(map((piece) => ({ project, piece })));
          }),
        ),
      ),
    );
  }

  // ─── Modelos por paso ─────────────────────────────────────────────

  /** Opciones de modelo para una modalidad ('Automático' = default del back).
   *  Los de razonamiento van primero para el Cerebro; los `:batch` se ocultan
   *  porque OpenRouter los rechaza en el chat síncrono. */
  private modelOptionsFor(modality: Modality): ModelOption[] {
    this.translate.currentLang();
    const list = this.models()
      .filter((m) => m.modality === modality && !m.name.toLowerCase().endsWith(':batch'))
      .slice()
      .sort((a, b) => Number(!!b.reasoning) - Number(!!a.reasoning))
      .map((m) => ({
        label: m.display_name || m.name,
        value: m.name,
        provider: m.credential_provider,
      }));
    return [{ label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO'), value: '' }, ...list];
  }

  /** Compara nombres con y sin el prefijo del catálogo ("openrouter/"). */
  private normalizedModelName(name: string): string {
    return name.trim().toLowerCase().replace(/^openrouter\//, '');
  }

  /** El proveedor solo conoce su id nativo: quita el prefijo del catálogo. */
  private modelForProvider(provider: CredentialProvider): string {
    const model = this.modelText().trim();
    if (provider === 'openrouter') return model.replace(/^openrouter\//, '');
    if (provider === 'anthropic') return model.replace(/^anthropic\//, '');
    return model;
  }

  /** Un modelo configurado en admin solo puede entrar al Cerebro si no es un
   *  generador de imagen/video del catálogo. */
  private isMediaModel(name: string): boolean {
    const target = name.trim().toLowerCase().replace(/^openrouter\//, '');
    if (!target) return false;
    return this.models().some((m) => {
      if (m.modality === 'text') return false;
      const catalog = m.name.trim().toLowerCase().replace(/^openrouter\//, '');
      return (
        catalog === target || catalog.endsWith(`/${target}`) || target.endsWith(`/${catalog}`)
      );
    });
  }

  /** Modelo LLM configurado en la credencial (extra.model de admin/models). */
  private credentialModel(cred: Credential): string {
    try {
      const extra = JSON.parse(cred.extra ?? '{}') as { model?: string };
      return (extra.model ?? '').trim();
    } catch {
      return '';
    }
  }

  /** URL del chat del agente elegido: cada experto tiene su ruta propia
   *  en el back (/agent/chat/commercial|real-estate|cinema). */
  private agentChatUrl(): string {
    return `${environment.API_URL}/agent/chat/${AGENT_ROUTE_SLUG[this.agent()]}`;
  }

  /** Credencial LLM usable del tenant (openrouter/anthropic): la dueña
   *  del modelo elegido en el cerebro del paso 1, si no la preferida por
   *  provider, si no la primera. Sin ninguna, el observable falla. */
  private pickLlmCredential(): Observable<Credential> {
    return this.agencyService.listCredentials().pipe(
      map((creds) => {
        const usable = creds.filter(
          (c) => !!c.api_key_mask && (c.provider === 'openrouter' || c.provider === 'anthropic'),
        );
        const model = this.modelText();
        // 1) la credencial dueña del modelo elegido; 2) los slugs estilo
        // "anthropic/claude…" solo existen en OpenRouter (preferido), y un
        // modelo sin barra (id nativo) corresponde a Anthropic.
        const byModel = model ? usable.find((c) => this.credentialModel(c) === model) : undefined;
        const providerFor = !model || model.includes('/') ? 'openrouter' : 'anthropic';
        return byModel ?? usable.find((c) => c.provider === providerFor) ?? usable[0] ?? null;
      }),
      mergeMap((cred) =>
        cred
          ? of(cred)
          : throwError(() => new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_LLM'))),
      ),
    );
  }

  /** Arma la lista de ángulos a crear (1–10), rotando las plantillas. */
  private buildAngles(count: number): SalesAngle[] {
    this.translate.currentLang();
    const n = Math.min(Math.max(Math.round(count) || 3, 1), 10);
    return Array.from({ length: n }, (_, i) => {
      const template = ANGLE_TEMPLATES[i % ANGLE_TEMPLATES.length];
      return {
        id: `angle-${i + 1}`,
        title: this.translate.instant('AGENCY.STUDIO.ANGLE_FALLBACK_TITLE', {
          n: i + 1,
          title: this.translate.instant(template.titleKey),
        }),
        description: this.translate.instant(template.descriptionKey),
        selected: false,
      };
    });
  }

  private anglesFromAgent(data: Record<string, unknown>, count: number): SalesAngle[] {
    const raw = Array.isArray(data['angles']) ? (data['angles'] as Record<string, unknown>[]) : [];
    return raw.slice(0, count).map((a, i) => ({
      id: `angle-${i + 1}`,
      title: String(
        a['title'] ?? this.translate.instant('AGENCY.STUDIO.ANGLE_DEFAULT_TITLE', { n: i + 1 }),
      ),
      description: [a['hook'], a['narrative_pitch'], a['target_audience']]
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .join(' — '),
      selected: !!a['selected'],
    }));
  }

  /** Ángulos de venta: los genera el LLM elegido (credencial del tenant) vía
   *  el agente experto del flujo. Sin credencial o sin respuesta el
   *  observable falla: no se rellena con plantillas, porque ángulos
   *  inventados no son producto. */
  private generateAnglesWithAgent(count: number): Observable<SalesAngle[]> {
    return this.pickLlmCredential().pipe(mergeMap((cred) => this.requestAgentAngles(cred, count)));
  }

  /** Paso 1 del flujo: el experto devuelve su artefacto (ángulos de venta,
   *  prompts de escena o análisis del guion, según el agente) y el back lo
   *  valida contra el contrato del .md. El brief viaja como `payload`, así
   *  el LLM no tiene que parsear el mensaje. Si el agente pide más
   *  información (evento `questions`) el turno se corta y las preguntas van
   *  al chat del asistente para continuar por ahí. */
  private requestAgentAngles(cred: Credential, count: number): Observable<SalesAngle[]> {
    const raw = this.form.getRawValue() as {
      propertyName: string;
      location: string;
      description: string;
    };
    const agent = this.agent();
    const message = [
      `${this.translate.instant(AGENT_KIND_LABEL[agent])}: ${raw.propertyName} (${raw.location}).`,
      raw.description,
      agent === 'real_estate'
        ? `Generá ${count} ángulos de venta y detené el flujo ahí.`
        : agent === 'commercial'
          ? `Generá ${count} prompts de escena, uno por escena del spot, y detené el flujo ahí.`
          : 'Generá los ángulos necesarios para comunicar el guion (máximo 10) y detené el flujo ahí.',
    ].join(' ');
    const token = this.session.token();
    const controller = new AbortController();
    // El turno de artefacto puede encadenar tools + un reintento de
    // corrección en el back: el tope es el mismo del chat largo.
    const timer = setTimeout(() => controller.abort(), 120_000);
    // Cantidad exacta solo donde el contrato la exige (inmobiliaria);
    // los otros expertos deciden cuántos prompts necesita el guion.
    // El contrato del paso 1 (docs/agente-*.md) declara estos datos como
    // ENTRADA: sin `cantidad_prompts`/`registro` el experto los pregunta en
    // vez de devolver el artefacto (y sin artefacto no hay prompts ni lista
    // de imágenes que pedir).
    const payload: Record<string, unknown> = {
      nombre_proyecto: raw.propertyName,
      ubicacion: raw.location,
      contexto: raw.description,
      ...(agent === 'real_estate' ? { cantidad_angulos: count } : {}),
      ...(agent === 'commercial' ? { cantidad_prompts: count } : {}),
      ...(agent === 'commercial' ? { referencias_subidas: this.referenciasSubidas() } : {}),
      ...(agent === 'cinema' ? { registro: 'cine' } : agent === 'commercial' ? { registro: 'comercial' } : {}),
    };

    return new Observable<SalesAngle[]>((subscriber) => {
      fetch(this.agentChatUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: this.conversationId(),
          message,
          provider: cred.provider,
          workflow: agent,
          // Artefacto del paso 1 según el agente elegido.
          artifact: ARTIFACT_STEP1[agent],
          payload,
          ...(this.modelText() ? { model: this.modelForProvider(cred.provider) } : {}),
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const detail = await res.text().catch(() => '');
            throw new Error(
              detail
                ? `HTTP ${res.status}: ${detail.slice(0, 240)}`
                : `agent chat HTTP ${res.status}`,
            );
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const rawEvent of events) {
              const parsed = parseAgentEvent(rawEvent);
              if (!parsed) continue;
              if (parsed.name === 'meta') {
                const conv = parsed.data['conversation_id'];
                if (typeof conv === 'string') this.setConversationId(conv);
                continue;
              }
              if (parsed.name === 'questions') {
                controller.abort();
                const questions = Array.isArray(parsed.data['questions'])
                  ? (parsed.data['questions'] as unknown[]).filter(
                      (q): q is string => typeof q === 'string' && q.trim() !== '',
                    )
                  : [];
                // Las preguntas se contestan en el chat del asistente:
                // se abre el panel y se vuelcan ahí.
                this.noteQuestions(questions);
                throw new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.QUESTIONS'));
              }
              if (parsed.name === 'artifact') {
                const kind = String(parsed.data['kind'] ?? '');
                const data = (parsed.data['data'] ?? {}) as Record<string, unknown>;
                const mapped =
                  kind === 'sales_angles'
                    ? this.anglesFromAgent(data, count)
                    : this.promptsToAngles(data);
                // El experto comercial devuelve además qué imágenes necesita
                // cada prompt (fotos_sugeridas): se piden antes del paso 2.
                if (kind === 'scene_prompts') {
                  this.applySuggestedPhotos(data);
                }
                if (mapped.length > 0) {
                  // Solo resultados reales: si el experto devolvió menos
                  // de los pedidos se muestran esos, sin plantillas.
                  controller.abort();
                  subscriber.next(mapped);
                  subscriber.complete();
                  return;
                }
              }
              // Alias legacy del back para el paso 1 inmobiliario.
              if (parsed.name === 'sales_angles') {
                const mapped = this.anglesFromAgent(parsed.data, count);
                if (mapped.length > 0) {
                  controller.abort();
                  subscriber.next(mapped);
                  subscriber.complete();
                  return;
                }
              }
              if (parsed.name === 'error') {
                throw new Error(
                  String(
                    parsed.data['message'] ??
                      this.translate.instant('AGENCY.STUDIO.ERRORS.AGENT_ERROR'),
                  ),
                );
              }
            }
          }
          throw new Error('sin artefacto del paso 1 en la respuesta');
        })
        .catch((err: unknown) => {
          const why =
            err instanceof Error && err.message
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE');
          subscriber.error(
            new Error(this.translate.instant('AGENCY.STUDIO.ERRORS.ANGLES', { why })),
          );
        })
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * Guarda las fotos sugeridas del paso 1 conservando lo que el usuario ya
   * subió: las filas se identifican por prompt+índice, así una regeneración
   * no le borra las imágenes cargadas. Solo aplica al comercial, que es el
   * flujo que resuelve las referencias antes de los prompts.
   */
  private applySuggestedPhotos(data: Record<string, unknown>): void {
    if (!this.isCommercial()) return;
    const previous = this.stepPhotos();
    // Las fotos ya subidas en el paso 1 cubren sugerencias por tipo: no se
    // vuelven a pedir (se consume una por cada foto del mismo tipo).
    const available = new Map<PhotoKind, number>();
    for (const photo of this.projectPhotos()) {
      if (photo.kind) available.set(photo.kind, (available.get(photo.kind) ?? 0) + 1);
    }
    const remaining = parseSuggestedPhotos(data).filter((photo) => {
      const kind = photoKindFromSuggestion(photo.type);
      if (!kind) return true;
      const count = available.get(kind) ?? 0;
      if (count <= 0) return true;
      available.set(kind, count - 1);
      return false;
    });
    this.stepPhotos.set(
      remaining.map((photo) => ({
        ...photo,
        files: previous.find((kept) => kept.id === photo.id)?.files ?? [],
      })),
    );
  }

  /** Escena/prompt del paso 1 → tarjeta del wizard (comercial y cine
   *  devuelven `prompts` en vez de `angulos`). */
  private promptsToAngles(data: Record<string, unknown>): SalesAngle[] {
    const raw = Array.isArray(data['prompts'])
      ? (data['prompts'] as Record<string, unknown>[])
      : [];
    return raw.map((p, i) => ({
      id: String(p['id'] ?? `P${i + 1}`),
      title: String(
        p['titulo'] ?? this.translate.instant('AGENCY.STUDIO.ANGLE_DEFAULT_TITLE', { n: i + 1 }),
      ),
      description: [p['resumen_para_usuario'], p['mensaje_marca']]
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .join(' — '),
      selected: false,
      // Se conserva el prompt completo (locación, personajes, beats): es el
      // insumo del prompt de video del paso Escenas.
      artifact: p as unknown as ScenePromptArtifact,
    }));
  }

  /** Vuelca las preguntas del agente al chat del asistente y abre el
   *  panel: ahí se contestan (el siguiente mensaje reintenta el paso). */
  private noteQuestions(questions: string[]): void {
    this.chatVisible.set(true);
    if (questions.length === 0) return;
    const body = questions.map((q) => `• ${q}`).join('\n');
    this.chatMessages.update((m) => [...m, { role: 'assistant', content: body }]);
  }

  // ─── Persistencia del avance (event.metadata.agency) ───────────────

  /** Guarda fase, modelos, ángulos y storyboard en el proyecto elegido.
   *
   *  Los envíos se serializan en una cola: tildar varios ángulos seguidos
   *  disparaba varios PATCH simultáneos que llegaban al servidor desordenados,
   *  de modo que el estado final guardado era un intermedio (se perdían tildes
   *  al recargar). El estado se arma recién al enviar: así el último PATCH de
   *  la cola siempre lleva el estado definitivo. */
  private persistChain: Promise<void> = Promise.resolve();

  private persistWorkflow(): void {
    const id = this.selectedProjectId();
    if (!id) return;
    this.persistChain = this.persistChain.then(() => this.sendWorkflow(id)).catch(() => undefined);
  }

  private async sendWorkflow(id: string): Promise<void> {
    const state = {
      phase: this.currentPhase(),
      agent: this.agent(),
      anglesCount: Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3,
      models: { text: this.modelText(), image: this.modelImage(), video: this.modelVideo() },
      videoSettings: {
        duration: this.videoDuration(),
        ratio: this.videoRatio(),
        resolution: this.videoResolution(),
        audio: this.videoAudio(),
        tags: this.videoTags(),
      },
      angles: this.angles(),
      storyboard: this.storyboard(),
      projectDescription: this.projectDescription(),
      // Imágenes pedidas por el experto en el paso 1 y lo que el usuario subió.
      stepPhotos: this.stepPhotos(),
      stepPhotosSkipped: this.stepPhotosSkipped(),
      // Fotos de referencia subidas antes de generar (tag + tipo).
      projectPhotos: this.projectPhotos(),
    };
    const project = this.projects().find((p) => p.id === id);
    let base: Record<string, unknown> = {};
    try {
      base = JSON.parse(project?.metadata ?? '{}') as Record<string, unknown>;
    } catch {
      base = {};
    }
    base['agency'] = state;
    const metadata = JSON.stringify(base);
    try {
      const updated = await firstValueFrom(this.eventsService.updateEvent(id, { metadata }));
      this.projects.update((list) =>
        list.map((p) =>
          p.id === updated.id ? { ...p, metadata: updated.metadata ?? metadata } : p,
        ),
      );
    } catch {
      // Sin backend no se corta el flujo: el siguiente guardado reenvía.
    }
  }

  /** Recupera el avance guardado del proyecto elegido: fase, modelos por paso,
   *  ángulos (con sus ajustes) y storyboard (imágenes/videos ya generados). */
  private restoreWorkflow(project: Project | null): void {
    if (!project) {
      this.currentPhase.set('input');
      const count = Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3;
      this.angles.set(this.buildAngles(count));
      this.storyboard.set([]);
      this.modelText.set('');
      this.modelImage.set('');
      this.modelVideo.set('');
      this.videoDuration.set(10);
      this.videoRatio.set('');
      this.videoTags.set('');
      this.videoResolution.set('');
      this.videoAudio.set(true);
      this.agent.set('commercial');
      this.projectPhotos.set([]);
      return;
    }
    let agency: Record<string, unknown> | null = null;
    try {
      const meta = JSON.parse(project.metadata ?? '{}') as Record<string, unknown>;
      agency = (meta['agency'] as Record<string, unknown> | undefined) ?? null;
    } catch {
      agency = null;
    }
    if (!agency) return;

    const savedAgent = agency['agent'];
    // Proyectos legacy (sin agente guardado) nacieron con el flujo inmobiliario.
    this.agent.set(
      savedAgent === undefined
        ? 'real_estate'
        : savedAgent === 'real_estate' || savedAgent === 'cinema' || savedAgent === 'commercial'
          ? savedAgent
          : 'commercial',
    );

    const models = (agency['models'] ?? {}) as { text?: string; image?: string; video?: string };
    this.modelText.set(models.text ?? '');
    this.modelImage.set(models.image ?? '');
    this.modelVideo.set(models.video ?? '');

    const videoSettings = (agency['videoSettings'] ?? {}) as {
      duration?: number;
      ratio?: string;
      resolution?: string;
      audio?: boolean;
      tags?: string;
    };
    if (Number.isFinite(videoSettings.duration) && (videoSettings.duration ?? 0) > 0) {
      this.videoDuration.set(Math.round(videoSettings.duration as number));
    }
    this.videoRatio.set(videoSettings.ratio ?? '');
    this.videoResolution.set(videoSettings.resolution ?? '');
    if (typeof videoSettings.audio === 'boolean') {
      this.videoAudio.set(videoSettings.audio);
    }
    this.videoTags.set(videoSettings.tags ?? '');

    const anglesCount = Number(agency['anglesCount']);
    if (Number.isFinite(anglesCount) && anglesCount > 0) {
      this.form.get('anglesCount')?.setValue(anglesCount, { emitEvent: false });
    }
    if (Array.isArray(agency['angles'])) {
      const saved = agency['angles'] as Partial<SalesAngle>[];
      if (saved.length > 0) {
        this.angles.set(
          saved.map((a, i) => ({
            id: a.id ?? `angle-${i + 1}`,
            title: a.title ?? '',
            description: a.description ?? '',
            selected: !!a.selected,
            artifact: a.artifact ?? null,
          })),
        );
      }
    }
    if (Array.isArray(agency['storyboard'])) {
      const scenes = agency['storyboard'] as Partial<StoryboardScene>[];
      this.storyboard.set(
        scenes.map((sc, i) => {
          const id = sc.id ?? `scene-${i}`;
          const shots = (sc.shots ?? []).map((sh, j) => ({
            ...sh,
            id: sh.id ?? `${id}-shot-${j + 1}`,
            generating: false,
            prompts: Array.isArray(sh.prompts)
              ? sh.prompts.map((p) => ({ ...p, generating: false }))
              : [],
          }));
          // Proyecto guardado con el flujo anterior: el video único pasa a
          // ser el primer prompt de la escena.
          const prompts = Array.isArray(sc.prompts)
            ? sc.prompts.map((p) => ({ ...p, generating: false }))
            : sc.videoUrl
              ? [{ text: sc.description ?? '', videoUrl: sc.videoUrl, generating: false }]
              : [];
          return {
            id,
            angleId: sc.angleId ?? '',
            angleTitle: sc.angleTitle ?? '',
            title: sc.title ?? '',
            description: sc.description ?? '',
            boardImageUrl: sc.boardImageUrl ?? null,
            boardFileId: sc.boardFileId ?? null,
            boardGenerating: false,
            approved: sc.approved ?? false,
            references: Array.isArray(sc.references) ? sc.references : [],
            refsApproved: sc.refsApproved ?? false,
            boardArtifact: sc.boardArtifact ?? null,
            clipArtifact: sc.clipArtifact ?? null,
            sceneArtifact: sc.sceneArtifact ?? null,
            prompts,
            shots,
          };
        }),
      );
    }
    if (typeof agency['projectDescription'] === 'string') {
      this.projectDescription.set(String(agency['projectDescription']));
    }
    this.stepPhotos.set(this.restoreStepPhotos(agency['stepPhotos']));
    this.stepPhotosSkipped.set(agency['stepPhotosSkipped'] === true);
    this.projectPhotos.set(this.restoreProjectPhotos(agency['projectPhotos']));
    const phase = agency['phase'];
    if (typeof phase === 'string') {
      const keys = this.phases().map((p) => p.key) as string[];
      // Un comercial guardado en Storyboard cae en Prompts: su flujo ya no
      // tiene ese paso.
      const fallback: WorkflowPhase = phase === 'storyboard' ? 'angles' : 'input';
      this.currentPhase.set(keys.includes(phase) ? (phase as WorkflowPhase) : fallback);
    }
    // Los prompts restaurados montan sus textareas en este ciclo: recalcula
    // las alturas para que el texto cargado se vea completo (sin scroll).
    this.autogrowAll();
  }

  /** Avance guardado de las imágenes del paso 1 (tolerante a basura). */
  private restoreStepPhotos(raw: unknown): RequiredPhoto[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Partial<RequiredPhoto>;
      if (!row.id || !row.description) return [];
      const files = Array.isArray(row.files)
        ? row.files.filter(
            (file): file is ReferenceImage => !!file && typeof file.id === 'string' && !!file.id,
          )
        : [];
      return [
        {
          id: row.id,
          promptId: row.promptId ?? '',
          type: row.type ?? 'sin_definir',
          description: row.description,
          reason: row.reason ?? '',
          priority:
            row.priority === 'imprescindible' || row.priority === 'recomendada'
              ? row.priority
              : 'opcional',
          files,
        },
      ];
    });
  }

  /** Avance guardado de las fotos de referencia subidas (tolerante a basura). */
  private restoreProjectPhotos(raw: unknown): ProjectPhoto[] {
    if (!Array.isArray(raw)) return [];
    const kinds = new Set<string>(PHOTO_KINDS);
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Partial<ProjectPhoto>;
      if (typeof row.id !== 'string' || !row.id) return [];
      const filename = typeof row.filename === 'string' ? row.filename : '';
      const tag = typeof row.tag === 'string' && row.tag ? row.tag : tagFromFilename(filename);
      const kind = typeof row.kind === 'string' && kinds.has(row.kind) ? (row.kind as PhotoKind) : null;
      return [
        {
          id: row.id,
          filename,
          url: typeof row.url === 'string' ? row.url : null,
          tag,
          kind,
        },
      ];
    });
  }

  // ─── Ajustes sobre cada generación ─────────────────────────────────

  protected updateAngle(angleId: string, field: 'title' | 'description', value: string): void {
    this.angles.update((list) =>
      list.map((a) => (a.id === angleId ? { ...a, [field]: value } : a)),
    );
  }

  protected commitAngleEdits(): void {
    this.persistWorkflow();
  }

  // ─── Fotos de referencia por escena ─────────────────────────────

  /** Escenas con uploads en curso (spinner del botón "Subir fotos"). */
  protected readonly uploadingRefScenes = signal<string[]>([]);

  /** Fotos sugeridas para ESTA escena: keywords sobre título+descripción de
   *  la escena, sus tomas y su ángulo (especialización por escena). */
  protected sceneSuggestions(sceneId: string): string[] {
    this.translate.currentLang();
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return DEFAULT_REFERENCE_SUGGESTIONS.map((k) => this.translate.instant(k));
    const angle = this.angles().find((a) => a.id === scene.angleId);
    const text = [
      scene.title,
      scene.description,
      ...scene.shots.map((sh) => sh.description ?? ''),
      angle?.title ?? '',
      angle?.description ?? '',
    ]
      .join(' ')
      .toLowerCase();
    const items: string[] = [];
    for (const group of REFERENCE_SUGGESTIONS) {
      if (!group.keywords.some((k) => text.includes(k))) continue;
      for (const key of group.itemKeys) {
        const item = this.translate.instant(key);
        if (!items.includes(item)) items.push(item);
      }
    }
    return items.length
      ? items.slice(0, 5)
      : DEFAULT_REFERENCE_SUGGESTIONS.map((k) => this.translate.instant(k));
  }

  /** Fotos ya subidas de la escena (miniaturas + narrativa). */
  private referencesOfScene(sceneId: string): ReferenceImage[] {
    return this.storyboard().find((s) => s.id === sceneId)?.references ?? [];
  }

  // ─── Modal "Editar elemento" (compartida con Recursos) ──────────────
  protected readonly editorVisible = signal(false);
  protected readonly editorAsset = signal<FileAsset | null>(null);
  protected readonly editorLoading = signal(false);

  /** Abre la modal "Editar elemento" desde cualquier miniatura de imagen
   *  (referencias de escena, hoja de storyboard, etc.). */
  protected openAssetEditor(fileId: string | null | undefined): void {
    if (!fileId || this.editorLoading() || this.editorVisible()) {
      return;
    }
    this.editorLoading.set(true);
    this.libraryService
      .getFile(fileId)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.ASSET_LOAD'));
          return EMPTY;
        }),
        finalize(() => this.editorLoading.set(false)),
      )
      .subscribe((asset) => {
        if (!asset) {
          this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.ASSET_LOAD'));
          return;
        }
        this.editorAsset.set(asset);
        this.editorVisible.set(true);
      });
  }

  /** Tras un cambio en la modal (asignar/subir/quitar): si el recurso fue
   *  eliminado, se cae de las referencias de las escenas (y se des aprueba)
   *  y/o del slot de hoja de storyboard. */
  protected onAssetEditorChanged(): void {
    const asset = this.editorAsset();
    if (!asset) {
      return;
    }
    this.libraryService
      .getFile(asset.id)
      .pipe(catchError(() => of(null)))
      .subscribe((fresh) => {
        if (fresh) {
          this.editorAsset.set(fresh);
          return;
        }
        let touched = false;
        this.storyboard.update((scenes) =>
          scenes.map((scene) => {
            const refs = scene.references ?? [];
            const inRefs = refs.some((ref) => ref.id === asset.id);
            const isBoard = scene.boardFileId === asset.id;
            if (!inRefs && !isBoard) {
              return scene;
            }
            touched = true;
            return {
              ...scene,
              references: inRefs ? refs.filter((ref) => ref.id !== asset.id) : refs,
              refsApproved: inRefs ? false : scene.refsApproved,
              boardFileId: isBoard ? null : scene.boardFileId,
            };
          }),
        );
        if (touched) {
          this.persistWorkflow();
        }
        this.editorVisible.set(false);
        this.editorAsset.set(null);
      });
  }

  /** Refleja el nombre/URL guardados en las referencias que apunten al asset. */
  protected onAssetEditorSaved(saved: FileAsset): void {
    let touched = false;
    this.storyboard.update((scenes) =>
      scenes.map((scene) => {
        const refs = scene.references ?? [];
        if (!refs.some((ref) => ref.id === saved.id)) {
          return scene;
        }
        touched = true;
        return {
          ...scene,
          references: refs.map((ref) =>
            ref.id === saved.id ? { ...ref, filename: saved.filename, url: saved.url } : ref,
          ),
        };
      }),
    );
    if (touched) {
      this.persistWorkflow();
    }
  }

  protected isUploadingRefs(sceneId: string): boolean {
    return this.uploadingRefScenes().includes(sceneId);
  }

  /** Gate: sin referencias aprobadas no se habilita "Generar Storyboard". */
  protected canGenerateBoard(scene: StoryboardScene): boolean {
    return !!scene.refsApproved && !scene.boardGenerating;
  }

  /** Sube las fotos elegidas al store y las acumula como referencia de la
   *  escena. Al cerrar el lote se rearma la narrativa de escenas y tomas. */
  protected onSceneReferenceFiles(sceneId: string, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (input) input.value = '';
    if (!files.length) return;
    if (!this.storyboard().some((s) => s.id === sceneId)) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.SCENE_NOT_FOUND'));
      return;
    }
    this.uploadingRefScenes.update((list) => (list.includes(sceneId) ? list : [...list, sceneId]));
    let pending = files.length;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      this.uploadingRefScenes.update((list) => list.filter((id) => id !== sceneId));
      if (this.storyboard().length) this.generatePrompts();
    };
    for (const file of files) {
      this.libraryService
        .uploadFile(file, 'images', this.selectedProjectId() ?? undefined)
        .subscribe({
          next: (asset) => {
            if (asset?.id) {
              this.storyboard.update((scenes) =>
                scenes.map((s) =>
                  s.id === sceneId
                    ? {
                        ...s,
                        references: [
                          ...(s.references ?? []),
                          { id: asset.id, filename: asset.filename, url: asset.url },
                        ],
                      }
                    : s,
                ),
              );
              this.persistWorkflow();
            }
            done();
          },
          error: () => {
            this.error.set(
              this.translate.instant('AGENCY.STUDIO.ERRORS.UPLOAD', { name: file.name }),
            );
            done();
          },
        });
    }
  }

  /** Quita una foto de referencia: vuelve a dejar las referencias sin aprobar
   *  (el gate de "Generar Storyboard" se cierra) y rearma la narrativa. */
  protected removeSceneReference(sceneId: string, referenceId: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              references: (s.references ?? []).filter((r) => r.id !== referenceId),
              refsApproved: false,
            }
          : s,
      ),
    );
    this.persistWorkflow();
    if (this.storyboard().length) this.generatePrompts();
  }

  /** Aprueba las referencias de la escena (requiere ≥1 foto): habilita
   *  "Generar Storyboard". */
  protected toggleApproveReferences(sceneId: string): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene?.references?.length || scene.refsApproved) return;
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, refsApproved: true } : s)),
    );
    this.persistWorkflow();
  }

  protected updateSceneDescription(sceneId: string, value: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, description: value } : s)),
    );
  }

  protected commitSceneEdit(): void {
    this.persistWorkflow();
  }

  // ─── Escenas: prompts por segmento y videos ─────────────────────

  /** Duración del segmento `index` (0-based) dentro de la duración pedida:
   *  si supera la capacidad del modelo, el video se parte en segmentos. */
  protected segmentDuration(index: number): number {
    const max = this.videoMaxDuration();
    const total = this.videoDuration();
    if (!max || total <= max) return total;
    return Math.max(Math.min(max, total - index * max), 1);
  }

  /** Cantidad de cajas por escena: el comercial filma una escena por prompt,
   *  sin partirla en segmentos (cada caja tiene su propia duración). */
  private promptSegments(): number {
    return this.isCommercial() ? 1 : this.videoSegmentCount();
  }

  /** Al entrar al paso Escenas cada storyboard aprobado tiene sus prompts. */
  private ensureVideoPrompts(): void {
    const segments = this.promptSegments();
    const pending = this.storyboard().some(
      (s) =>
        (s.prompts?.length ?? 0) !== segments ||
        s.shots.some((sh) => (sh.prompts?.length ?? 0) !== segments),
    );
    if (pending) this.generatePrompts();
  }

  /** Rearma los prompts de cada escena y de cada toma según la configuración
   *  actual (modelo, duración, ratio, resolución). Los videos ya generados se
   *  conservan por índice. */
  protected generatePrompts(): void {
    const segments = this.promptSegments();
    const tags = this.videoTags().trim();
    const ratio = this.videoRatio();
    const resolution = this.videoResolution();
    this.storyboard.update((scenes) =>
      scenes.map((scene) => ({
        ...scene,
        prompts: this.buildPrompts(scene, null, segments, tags, ratio, resolution),
        shots: scene.shots.map((shot) => ({
          ...shot,
          prompts: this.buildPrompts(scene, shot, segments, tags, ratio, resolution),
        })),
      })),
    );
    this.persistWorkflow();
    // El texto cambió: recalcula la altura de los textareas auto-crecibles.
    this.autogrowAll();
  }

  private buildPrompts(
    scene: StoryboardScene,
    shot: StoryboardShot | null,
    segments: number,
    tags: string,
    ratio: string,
    resolution: string,
  ): VideoPrompt[] {
    const previous = (shot ? shot.prompts : scene.prompts) ?? [];
    return Array.from({ length: segments }, (_, i) => ({
      text: this.buildPromptText(scene, shot, i, segments, tags, ratio, resolution),
      videoUrl: previous[i]?.videoUrl ?? null,
      // Conserva el estado si el prompt ya se está generando en este momento.
      generating: previous[i]?.generating ?? false,
      // Overrides por prompt: sobreviven al rearmado de la config global.
      duration: previous[i]?.duration ?? null,
      resolution: previous[i]?.resolution ?? null,
      audio: previous[i]?.audio ?? null,
      videoModel: previous[i]?.videoModel ?? null,
      ratio: previous[i]?.ratio ?? null,
    }));
  }

  /** Texto de un prompt: escena/toma + referencia al storyboard + tags de
   *  referencia + segmento, duración, ratio y resolución. */
  private buildPromptText(
    scene: StoryboardScene,
    shot: StoryboardShot | null,
    index: number,
    segments: number,
    tags: string,
    ratio: string,
    resolution: string,
  ): string {
    // Escena con artefacto clip_prompt: el texto creativo (con sus bloques
    // y tiempos) lo escribió el experto; solo se agregan la continuidad
    // entre segmentos y la línea de especificación del modelo.
    if (!shot && scene.clipArtifact?.prompt_video) {
      const lines = [scene.clipArtifact.prompt_video];
      if (segments > 1) {
        lines.push(
          `Segmento ${index + 1} de ${segments}: continuidad directa con el segmento anterior, mismo ritmo, encuadre y personajes.`,
        );
      }
      lines.push(this.specLine(this.segmentDuration(index), ratio, resolution));
      return lines.join('\n');
    }
    // Comercial: el prompt de la escena se compone del artefacto del experto,
    // con un slot por foto que el usuario reemplaza por su tag en Escenas.
    if (!shot && this.isCommercial() && scene.sceneArtifact) {
      return this.composeCommercialPrompt(scene, index, segments, ratio, resolution);
    }
    // Inmobiliaria y cine: prompt directo, corte por corte, con la duración
    // repartida en partes iguales. Sin contexto de venta: el modelo de video
    // solo necesita saber qué ver y con qué imagen.
    if (!shot && !this.isCommercial()) {
      const vinetas = this.sceneClipVinetas(scene);
      if (vinetas.length > 0) {
        const hasBoard = !!scene.boardFileId;
        const refs = this.referencesOfScene(scene.id).filter((ref) => ref.id !== scene.boardFileId);
        return composeSceneClipPrompt({
          sceneNumber: Math.max(this.storyboard().findIndex((s) => s.id === scene.id), 0) + 1,
          duration: this.segmentDuration(index),
          board: hasBoard
            ? { tag: imageTag(0), filename: `storyboard-${scene.id}.png` }
            : null,
          references: refs.map((ref, i) => ({
            tag: imageTag(i + (hasBoard ? 1 : 0)),
            filename: ref.filename,
          })),
          vinetas,
          segmentIndex: index,
          segmentCount: segments,
          tags,
          specLine: this.specLine(this.segmentDuration(index), ratio, resolution),
        });
      }
    }
    const shotIndex = shot ? scene.shots.indexOf(shot) : -1;
    const lines: string[] =
      shotIndex >= 0
        ? [
            `TOMA ${shotIndex + 1}/${scene.shots.length} — "${scene.title}": ${shot?.description ?? ''}`,
            `Referencia visual: viñeta ${shotIndex + 1} del storyboard guía (imagen adjunta). Mantener encuadre, iluminación y estilo del dibujo.`,
          ]
        : [
            `ESCENA "${scene.title}"${scene.angleTitle ? ` — ángulo "${scene.angleTitle}"` : ''}: ${scene.description}`,
            // El comercial no dibuja hoja: sus referencias son las fotos del
            // paso 1, que van tagueadas más abajo.
            ...(scene.boardFileId
              ? [
                  'Referencia visual: hoja de storyboard guía (imagen adjunta). Animar la secuencia respetando encuadres, iluminación y estilo de las viñetas.',
                ]
              : []),
          ];
    const tagLines = this.sceneReferenceTagLines(scene);
    if (tagLines.length) {
      lines.push(`Referencias visuales adjuntas: ${tagLines.join(' ')}`);
    }
    // Las sugerencias por keywords del flujo inmobiliario no aplican al
    // comercial, que ya trae la descripción exacta de cada foto.
    const references = this.isCommercial() ? null : this.referenceNarrative(scene);
    if (references) lines.push(references);
    const allTags = [tags, this.slugTags([scene.angleTitle, scene.title])]
      .filter((t) => t.trim() !== '')
      .join(' ');
    if (allTags) lines.push(`Tags de referencia: ${allTags}`);
    if (segments > 1) {
      lines.push(
        `Segmento ${index + 1} de ${segments}: continuidad directa con el segmento anterior, mismo ritmo, encuadre y personajes.`,
      );
    }
    lines.push(this.specLine(this.segmentDuration(index), ratio, resolution));
    return lines.join('\n');
  }

  /** Viñetas del clip: las del experto o, sin artefacto, las tomas con
   *  descripción real (se descartan los placeholders "Toma N — ..."). */
  private sceneClipVinetas(scene: StoryboardScene): ClipVinheta[] {
    const fromExpert = scene.boardArtifact?.vinetas ?? [];
    if (fromExpert.length > 0) return fromExpert;
    return scene.shots
      .map((shot) => (shot.description ?? '').trim())
      .filter((text) => text !== '' && !/^Toma \d+/i.test(text))
      .map((text) => ({ que_se_ve: text }));
  }

  /** Prompt de una escena comercial a partir del artefacto del paso 1: cada
   *  foto que pide el experto queda como slot "aquí debe ir una foto" para que
   *  el usuario inserte el tag `@archivo` donde corresponde. */
  private composeCommercialPrompt(
    scene: StoryboardScene,
    index: number,
    segments: number,
    ratio: string,
    resolution: string,
  ): string {
    const t = (key: string): string => this.translate.instant(key);
    const plan = planScenePrompt(scene.sceneArtifact ?? null);
    const hasContent =
      !!plan &&
      (!!plan.location ||
        plan.characters.length > 0 ||
        !!plan.product ||
        plan.beats.length > 0 ||
        !!plan.camera.mode ||
        !!plan.camera.registro ||
        !!plan.marca);
    const lines: string[] = [
      `ESCENA "${scene.title}"${scene.angleTitle ? ` — ángulo "${scene.angleTitle}"` : ''}`,
    ];
    if (plan && hasContent) {
      if (plan.summary) lines.push(plan.summary);
      if (plan.location) {
        lines.push(`${t('AGENCY.STUDIO.P2_LOCATION')}: ${this.sceneFieldText(plan.location)}`);
      }
      if (plan.characters.length) {
        const people = plan.characters.map((slot) => this.sceneFieldText(slot)).join(' ');
        lines.push(`${t('AGENCY.STUDIO.P2_CHARACTERS')}: ${people}`);
      }
      if (plan.product) {
        lines.push(`${t('AGENCY.STUDIO.P2_PRODUCT')}: ${this.sceneFieldText(plan.product)}`);
      }
      if (plan.beats.length) {
        lines.push(`${t('AGENCY.STUDIO.C1_ACTION')}:`);
        for (const beat of plan.beats) {
          const body = [beat.action, beat.dialogue].filter((part) => part !== '').join(' · ');
          if (body) lines.push(`- ${body}`);
        }
      }
      const camera = [plan.camera.mode, plan.camera.registro]
        .filter((part) => part !== '')
        .join(' · ');
      if (camera) lines.push(`${t('AGENCY.STUDIO.P2_CAMERA')}: ${camera}`);
      if (plan.marca) lines.push(`${t('AGENCY.STUDIO.C1_MARCA')}: ${plan.marca}`);
    } else {
      lines.push(scene.description);
    }
    if (segments > 1) {
      lines.push(
        `Segmento ${index + 1} de ${segments}: continuidad directa con el segmento anterior, mismo ritmo, encuadre y personajes.`,
      );
    }
    lines.push(this.specLine(this.segmentDuration(index), ratio, resolution));
    return lines.join('\n');
  }

  /** Última línea del prompt: duración/ratio + calidad y sonido según la
   *  config global del paso (o el override puntual del prompt). */
  private specLine(
    duration: number,
    ratio: string,
    resolution?: string | null,
    audio?: boolean | null,
  ): string {
    const res = resolution === undefined ? this.videoResolution() : (resolution ?? '');
    const sound = audio ?? this.videoAudio();
    return (
      `Duración ${duration}s` +
      (ratio ? ` · Relación de aspecto ${ratio}` : '') +
      (res ? ` · Calidad ${res}` : '') +
      ` · Sonido ${sound ? 'activado' : 'desactivado'}` +
      '.'
    );
  }

  /** Reemplaza la línea "Duración …" del prompt (o la agrega al final). */
  private replaceSpecLine(text: string, line: string): string {
    return /^Duración .+$/m.test(text) ? text.replace(/^Duración .+$/m, line) : `${text}\n${line}`;
  }

  /** Prompt concreto (de la escena o de una toma) por posición. */
  private promptAt(sceneId: string, shotId: string | null, index: number): VideoPrompt | null {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return null;
    const target = shotId ? scene.shots.find((sh) => sh.id === shotId) : scene;
    return target?.prompts?.[index] ?? null;
  }

  /** Override de duración/calidad/sonido de un prompt: guarda el dato y
   *  reescribe la línea de especificación del texto (el resto del prompt
   *  escrito a mano queda intacto). */
  private patchPromptSpec(
    sceneId: string,
    shotId: string | null,
    index: number,
    patch: {
      duration?: number;
      resolution?: string | null;
      audio?: boolean;
      ratio?: string | null;
      videoModel?: string | null;
    },
  ): void {
    const prompt = this.promptAt(sceneId, shotId, index);
    if (!prompt) return;
    const videoModel =
      patch.videoModel !== undefined ? patch.videoModel : (prompt.videoModel ?? null);
    const ratio = patch.ratio !== undefined ? patch.ratio : (prompt.ratio ?? null);
    const duration = patch.duration ?? prompt.duration ?? null;
    const resolution =
      patch.resolution !== undefined ? patch.resolution : (prompt.resolution ?? null);
    const audio = patch.audio ?? prompt.audio ?? null;
    const text = this.replaceSpecLine(
      // Si el prompt es el directo (corte por corte), reparte la nueva
      // duración en partes iguales entre sus viñetas.
      rescaleClipDurations(prompt.text, duration ?? this.segmentDuration(index)),
      // null/undefined → manda la config global; '' explícito = Automática.
      this.specLine(
        duration ?? this.segmentDuration(index),
        ratio || this.videoRatio(),
        resolution ?? undefined,
        audio,
      ),
    );
    this.patchPrompt(sceneId, shotId, index, {
      duration,
      resolution,
      audio,
      ratio,
      videoModel,
      text,
    });
    this.commitSceneEdit();
  }

  protected setPromptDuration(
    sceneId: string,
    shotId: string | null,
    index: number,
    value: number | null,
  ): void {
    if (!value || value < 1) return;
    this.patchPromptSpec(sceneId, shotId, index, { duration: Math.round(value) });
  }

  protected setPromptResolution(
    sceneId: string,
    shotId: string | null,
    index: number,
    value: string,
  ): void {
    this.patchPromptSpec(sceneId, shotId, index, { resolution: value });
  }

  protected setPromptAudio(
    sceneId: string,
    shotId: string | null,
    index: number,
    value: boolean,
  ): void {
    this.patchPromptSpec(sceneId, shotId, index, { audio: value });
  }

  /** Cambia el modelo de video de una caja: si su ratio/calidad no existen en
   *  el modelo nuevo, vuelven a "Automática". */
  protected setPromptModel(
    sceneId: string,
    shotId: string | null,
    index: number,
    value: string | null,
  ): void {
    const prompt = this.promptAt(sceneId, shotId, index);
    if (!prompt) return;
    const model = value ? (this.models().find((m) => m.name === value) ?? null) : null;
    const ratios = model?.defaults?.ratios ?? [];
    const resolutions = model?.defaults?.resolutions ?? [];
    this.patchPromptSpec(sceneId, shotId, index, {
      videoModel: model?.name ?? null,
      ratio: prompt.ratio && ratios.includes(prompt.ratio) ? prompt.ratio : null,
      resolution:
        prompt.resolution && resolutions.includes(prompt.resolution) ? prompt.resolution : null,
    });
  }

  protected setPromptRatio(
    sceneId: string,
    shotId: string | null,
    index: number,
    value: string,
  ): void {
    this.patchPromptSpec(sceneId, shotId, index, { ratio: value });
  }

  /** Modelo de video efectivo de una caja (el propio o el del paso 4). */
  protected promptModel(prompt: VideoPrompt): AiModel | null {
    const list = this.models().filter((m) => m.modality === 'video');
    if (prompt.videoModel) return list.find((m) => m.name === prompt.videoModel) ?? null;
    return this.activeVideoModel();
  }

  /** Relaciones de aspecto del modelo propio de la caja. */
  protected promptRatioOptions(prompt: VideoPrompt): { label: string; value: string }[] {
    const ratios = this.promptModel(prompt)?.defaults?.ratios ?? [];
    return [
      { label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO_RATIO'), value: '' },
      ...ratios.map((r) => ({ label: r, value: r })),
    ];
  }

  /** Calidades del modelo propio de la caja. */
  protected promptResolutionOptions(prompt: VideoPrompt): { label: string; value: string }[] {
    const resolutions = this.promptModel(prompt)?.defaults?.resolutions ?? [];
    return [
      { label: this.translate.instant('AGENCY.STUDIO.MODEL_AUTO_RATIO'), value: '' },
      ...resolutions.map((r) => ({ label: r, value: r })),
    ];
  }

  /** 'Exclusividad y lujo' → '#exclusividad-y-lujo' */
  private slugTags(values: (string | undefined)[]): string {
    return values
      .filter((v): v is string => !!v && v.trim() !== '')
      .map(
        (v) =>
          '#' +
          v
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w]+/g, '-')
            .replace(/^-+|-+$/g, ''),
      )
      .join(' ');
  }

  /** Cambió la config de video: ratio y resolución deben pertenecer al
   *  modelo activo y, si cambió la cantidad de segmentos, se rearmán los
   *  prompts (los videos ya generados se conservan por índice). */
  protected onVideoConfigChange(): void {
    const options = this.videoRatioOptions();
    if (!options.some((o) => o.value === this.videoRatio())) {
      this.videoRatio.set(options[0]?.value ?? '');
    }
    const qualityOptions = this.videoResolutionOptions();
    if (!qualityOptions.some((o) => o.value === this.videoResolution())) {
      this.videoResolution.set(qualityOptions[0]?.value ?? '');
    }
    const segments = this.promptSegments();
    if (this.storyboard().some((s) => (s.prompts?.length ?? 0) !== segments)) {
      this.generatePrompts();
    }
  }

  protected updateScenePrompt(sceneId: string, index: number, value: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              prompts: (s.prompts ?? []).map((p, i) => (i === index ? { ...p, text: value } : p)),
            }
          : s,
      ),
    );
  }

  protected updateShotPrompt(sceneId: string, shotId: string, index: number, value: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              shots: s.shots.map((sh) =>
                sh.id === shotId
                  ? {
                      ...sh,
                      prompts: (sh.prompts ?? []).map((p, i) =>
                        i === index ? { ...p, text: value } : p,
                      ),
                    }
                  : sh,
              ),
            }
          : s,
      ),
    );
  }

  /** Último textarea de prompt enfocado: es donde se inserta el tag de una
   *  foto al hacer click en su miniatura. */
  private activePromptField: {
    sceneId: string;
    index: number;
    el: HTMLTextAreaElement;
  } | null = null;

  protected rememberPromptField(
    sceneId: string,
    index: number,
    el: HTMLTextAreaElement,
  ): void {
    this.activePromptField = { sceneId, index, el };
  }

  /** Rango `(…)` que envuelve al cursor, si el cursor está dentro de un
   *  paréntesis (el slot "aquí debe ir una foto"); si no, un punto vacío. */
  private slotRangeAt(text: string, caret: number): { start: number; end: number } {
    const open = text.lastIndexOf('(', caret);
    const close = text.indexOf(')', caret);
    if (open === -1 || close === -1 || open > close) return { start: caret, end: caret };
    if (text.slice(open, caret).includes(')')) return { start: caret, end: caret };
    return { start: open, end: close + 1 };
  }

  /** Inserta el tag de una foto en el slot de su tipo (personaje/locación/
   *  producto). Si no hay slot libre, lo inserta en el cursor; props siempre
   *  se inserta en el cursor. */
  protected insertProjectPhotoTag(
    sceneId: string,
    index: number,
    tag: string,
    kind: PhotoKind | null,
  ): void {
    const prompt = this.promptAt(sceneId, null, index);
    if (!prompt) return;
    const scene = this.storyboard().find((s) => s.id === sceneId);
    const text = prompt.text;
    const field =
      this.activePromptField && this.activePromptField.sceneId === sceneId && this.activePromptField.index === index
        ? this.activePromptField
        : null;
    const caret = field ? (field.el.selectionStart ?? text.length) : text.length;
    const plan = planScenePrompt(scene?.sceneArtifact ?? null);
    const slots: PromptSlotText[] = [];
    if (plan?.location) {
      slots.push({ kind: 'location', value: this.sceneFieldText(plan.location) });
    }
    for (const character of plan?.characters ?? []) {
      slots.push({ kind: 'character', value: this.sceneFieldText(character) });
    }
    if (plan?.product) {
      slots.push({ kind: 'product', value: this.sceneFieldText(plan.product) });
    }
    const slot = slotRangeForKind(text, kind, slots, field ? caret : undefined);
    const target = slot ?? (plan ? { start: caret, end: caret } : this.slotRangeAt(text, caret));
    const insert = `${tag} `;
    const next = `${text.slice(0, target.start)}${insert}${text.slice(target.end)}`;
    this.patchPrompt(sceneId, null, index, { text: next });
    this.commitSceneEdit();
    const pos = target.start + insert.length;
    if (field) {
      queueMicrotask(() => {
        field.el.focus();
        field.el.setSelectionRange(pos, pos);
      });
    }
  }

  /** Patch de un prompt concreto (de la escena o de una toma). */
  private patchPrompt(
    sceneId: string,
    shotId: string | null,
    index: number,
    patch: Partial<VideoPrompt>,
  ): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const applyPatch = (prompts?: VideoPrompt[]): VideoPrompt[] =>
          (prompts ?? []).map((p, i) => (i === index ? { ...p, ...patch } : p));
        if (!shotId) return { ...s, prompts: applyPatch(s.prompts) };
        return {
          ...s,
          shots: s.shots.map((sh) =>
            sh.id === shotId ? { ...sh, prompts: applyPatch(sh.prompts) } : sh,
          ),
        };
      }),
    );
  }

  // ─── Recursos asignados a cada prompt (paso Escenas) ─────────────

  /** Bloques de recursos expandidos en el paso Escenas (colapsados por defecto). */
  protected readonly openPromptResources = signal<ReadonlySet<string>>(new Set());

  private promptResourcesKey(sceneId: string, shotId: string | null, index: number): string {
    return `${sceneId}|${shotId ?? 'scene'}|${index}`;
  }

  protected togglePromptResources(sceneId: string, shotId: string | null, index: number): void {
    const key = this.promptResourcesKey(sceneId, shotId, index);
    this.openPromptResources.update((set) => {
      const next = new Set(set);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  protected isPromptResourcesOpen(sceneId: string, shotId: string | null, index: number): boolean {
    return this.openPromptResources().has(this.promptResourcesKey(sceneId, shotId, index));
  }

  /** Recursos asignados a un prompt: la hoja de storyboard (si existe) más
   *  las fotos cuyo tag aparece en ESE prompt. En comercial sólo cuentan las
   *  fotos tagueadas: una foto subida sin insertar no se adjunta.
   *  Espeja el `content` que arma videoPayloadFor. */
  protected promptResources(
    scene: StoryboardScene,
    prompt: VideoPrompt,
  ): { id: string; name: string; url: string | null; kind: PhotoKind | null }[] {
    const items: { id: string; name: string; url: string | null; kind: PhotoKind | null }[] = [];
    if (scene.boardFileId) {
      items.push({
        id: scene.boardFileId,
        name: `storyboard-${scene.id}.png`,
        url: scene.boardImageUrl ?? null,
        kind: null,
      });
    }
    const tags = new Set(parseTagsFromText(prompt.text));
    const namedTags = [...tags].some((tag) => !/^@image\d+$/.test(tag));
    for (const ref of this.referencesOfScene(scene.id)) {
      if (ref.id === scene.boardFileId) continue;
      if (this.isCommercial()) {
        if (namedTags) {
          if (!ref.note || !tags.has(ref.note.toLowerCase())) continue;
        } else if (tags.size === 0) {
          continue;
        }
      }
      items.push({ id: ref.id, name: ref.filename, url: ref.url, kind: ref.kind ?? null });
    }
    return items;
  }

  /** El modelo elegido adjunta una sola imagen y hay varias tagueadas. */
  protected promptHasSingleReference(scene: StoryboardScene, prompt: VideoPrompt): boolean {
    if (this.promptResources(scene, prompt).length <= 1) return false;
    const model = prompt.videoModel
      ? (this.models().find((m) => m.name === prompt.videoModel) ?? this.activeVideoModel())
      : this.activeVideoModel();
    return !!model && !model.reference_endpoint;
  }

  /** Genera el video de un prompt (de la escena o de una toma): texto del
   *  prompt + hoja de storyboard como imagen de referencia, duración del
   *  segmento, ratio, resolución y sonido según la configuración. */
  protected generatePromptVideo(sceneId: string, shotId: string | null, index: number): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return;
    const shotIndex = shotId ? scene.shots.findIndex((sh) => sh.id === shotId) : -1;
    const target = shotId ? (shotIndex >= 0 ? scene.shots[shotIndex] : null) : scene;
    const prompt = target?.prompts?.[index];
    if (!target || !prompt || prompt.generating) return;
    const model = this.activeVideoModel();
    if (!model) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_VIDEO_MODELS'));
      return;
    }
    this.error.set(null);
    this.patchPrompt(sceneId, shotId, index, { generating: true });
    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.PREPARE_PROJECT'));
          this.patchPrompt(sceneId, shotId, index, { generating: false });
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        const payload = this.videoPayloadFor(scene, shotId, index, model, project, piece);
        if (!payload) {
          this.patchPrompt(sceneId, shotId, index, { generating: false });
          return;
        }
        const ratio = payload.ratio ?? '';
        const resolution = payload.resolution ?? '';
        const takeModel = this.models().find((m) => m.name === payload.model) ?? model;
        // Take en la cola/take reel (paso 4): el popover lo sigue en vivo aunque
        // este botón se resetee, y su estado manda hasta que la tarea resuelva.
        const takeId = `pending_${Date.now()}`;
        this.eventsStore.upsert({
          id: takeId,
          prompt: prompt.text,
          modelName: takeModel.name,
          modelDisplayName: takeModel.display_name || takeModel.name,
          modelType: 'api',
          ratio,
          resolution: resolution || takeModel.defaults?.resolutions?.[0] || '',
          duration: payload.duration ?? 0,
          status: 'queued',
          progress: 0,
          videoUrl: null,
          error: null,
          createdAt: Date.now(),
          ratingGood: false,
          ratingFinal: false,
          eventName: null,
          refImages: [],
          request: payload,
        });
        // Auto-abre el popover del paso 4 con la cola de generación en curso.
        this.showVideoReel();
        this.agencyService
          .generate('video', payload)
          .pipe(
            catchError(() => {
              this.error.set(
                this.translate.instant('AGENCY.STUDIO.ERRORS.VIDEO_GENERATE', {
                  title: scene.title,
                }),
              );
              this.eventsStore.remove(takeId);
              this.patchPrompt(sceneId, shotId, index, { generating: false });
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            // El take pasa a usar el id real de la tarea y empieza a seguirse.
            this.eventsStore.patch(takeId, {
              id: response.taskId,
              costCredits: response.cost_credits ?? 0,
              costUsd: response.cost_usd ?? 0,
              transactionId: response.provider_transaction_id || null,
            });
            this.eventsStore.track(response.taskId);
            // El prompt guarda el task: habilita calificar e "Ir a estudio"
            // desde la card sin depender del reel.
            this.patchPrompt(sceneId, shotId, index, { taskId: response.taskId });
            this.agencyService
              .pollTaskUntilDone('video', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(
                    this.translate.instant('AGENCY.STUDIO.ERRORS.VIDEO_POLL', {
                      title: scene.title,
                    }),
                  );
                  this.patchPrompt(sceneId, shotId, index, { generating: false });
                  return EMPTY;
                }),
              )
              .subscribe((status: StatusResponse) => {
                const url =
                  status.status === 'succeeded' && status.outputs?.[0]?.url
                    ? status.outputs[0].url
                    : null;
                if (status.status === 'failed' || status.status === 'cancelled') {
                  this.error.set(
                    status.status === 'failed'
                      ? this.translate.instant('AGENCY.STUDIO.ERRORS.VIDEO_FAILED', {
                          title: scene.title,
                          error:
                            status.error ?? this.translate.instant('AGENCY.STUDIO.ERRORS.RETRY'),
                        })
                      : this.translate.instant('AGENCY.STUDIO.ERRORS.VIDEO_CANCELLED', {
                          title: scene.title,
                        }),
                  );
                }
                this.patchPrompt(sceneId, shotId, index, {
                  generating: false,
                  videoUrl: url ?? prompt.videoUrl ?? null,
                });
                // El video queda guardado en el avance del proyecto.
                this.persistWorkflow();
              });
          });
      });
  }

  /** Payload de generación de un prompt (compartido por "Generar video" y
   *  por "Ir a estudio"): texto + storyboard + refs, con los overrides del
   *  prompt (duración/calidad/sonido) y la config global del paso 4. */
  private videoPayloadFor(
    scene: StoryboardScene,
    shotId: string | null,
    index: number,
    model: AiModel,
    project: Project | null,
    piece: Piece | null,
  ): GenerateRequest | null {
    const shotIndex = shotId ? scene.shots.findIndex((sh) => sh.id === shotId) : -1;
    const target = shotId ? (shotIndex >= 0 ? scene.shots[shotIndex] : null) : scene;
    const prompt = target?.prompts?.[index];
    if (!target || !prompt) return null;
    // Modelo de la caja (si eligió uno propio) o el del paso 4.
    const boxModel = prompt.videoModel
      ? (this.models().find((m) => m.name === prompt.videoModel) ?? null)
      : null;
    const chosen = boxModel ?? model;
    const ratio = prompt.ratio || this.videoRatio() || chosen.defaults?.ratios?.[0] || '';
    const content: ContentItem[] = [{ type: 'text', text: prompt.text }];
    if (scene.boardFileId) {
      content.push({ type: 'image', id: scene.boardFileId, name: `storyboard-${scene.id}.png` });
    }
    const realReferences = this.referencesOfScene(scene.id).filter(
      (ref) => ref.id !== scene.boardFileId,
    );
    // Comercial: sólo se adjuntan las fotos cuyo tag aparece en ESTE prompt.
    // Sin tags no se adjunta ninguna; el tagueo posicional legado (`@image1`)
    // se mantiene adjuntando todas.
    const tags = new Set(parseTagsFromText(prompt.text));
    const namedTags = [...tags].some((tag) => !/^@image\d+$/.test(tag));
    const sceneReferences = this.isCommercial()
      ? namedTags
        ? realReferences.filter((ref) => tags.has((ref.note ?? '').toLowerCase()))
        : tags.size > 0
          ? realReferences
          : []
      : realReferences;
    // Fotos reales del ángulo: solo cuando el modelo expone ruta
    // multi-referencia verificada, para no sacarlo de su ruta i2v de
    // imagen única (donde la hoja dejaría de adjuntarse).
    if (chosen.reference_endpoint) {
      for (const ref of sceneReferences) {
        content.push({ type: 'image', id: ref.id, name: ref.filename });
      }
    } else if (!scene.boardFileId && sceneReferences.length > 0) {
      // Comercial sin hoja y modelo de imagen única: la primera foto subida
      // en el paso 1 es el ancla visual del clip.
      content.push({ type: 'image', id: sceneReferences[0].id, name: sceneReferences[0].filename });
    }
    // Slot único por prompt (escenas 1..N, tomas 101..N): así no se pisan
    // entre sí al guardarse en la pieza (SaveGeneration desactiva el mismo nro).
    const generationNumber = shotId ? (shotIndex + 1) * 100 + index + 1 : index + 1;
    const resolution = prompt.resolution ?? this.videoResolution();
    return {
      model: chosen.name,
      content,
      ...(ratio ? { ratio } : {}),
      duration: prompt.duration ?? this.segmentDuration(index),
      ...(resolution ? { resolution } : {}),
      generate_audio: prompt.audio ?? this.videoAudio(),
      event_id: project?.id ?? '',
      piece_id: piece?.id ?? '',
      piece_code: piece?.piece_code ?? `SCENE-${scene.id.toUpperCase()}`,
      generation_number: generationNumber,
    };
  }

  /** Take del reel correspondiente a un prompt (por task id o, para prompts
   *  antiguos sin id, por la URL del video generado). */
  protected takeForPrompt(
    sceneId: string,
    shotId: string | null,
    index: number,
  ): StudioTake | null {
    const prompt = this.promptAt(sceneId, shotId, index);
    if (!prompt) return null;
    const takes = this.eventsStore.events();
    if (prompt.taskId) {
      const byId = takes.find((t) => t.id === prompt.taskId);
      if (byId) return byId;
    }
    if (!prompt.videoUrl) return null;
    return takes.find((t) => t.videoUrl === prompt.videoUrl) ?? null;
  }

  /** Encola un prompt (escena o toma) para generarlo a demanda desde el Estudio. */
  protected enqueuePrompt(sceneId: string, shotId: string | null, index: number): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    const model = this.activeVideoModel();
    if (!scene || !model) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_VIDEO_MODELS'));
      return;
    }
    const shotIndex = shotId ? scene.shots.findIndex((sh) => sh.id === shotId) : -1;
    const target = shotId ? (shotIndex >= 0 ? scene.shots[shotIndex] : null) : scene;
    const prompt = target?.prompts?.[index];
    if (!prompt || !prompt.text.trim()) return;
    const payload = this.videoPayloadFor(scene, shotId, index, model, null, null);
    if (!payload) return;
    const takeModel = this.models().find((m) => m.name === payload.model) ?? model;
    const assets = payload.content
      .filter((item) => item.type === 'image' || item.type === 'video' || item.type === 'audio')
      .map((item) => ({ id: item.id ?? '', name: item.name ?? '', kind: item.type as 'image' | 'video' | 'audio' }))
      .filter((asset) => asset.id.length > 0);
    this.generationQueue.add([
      {
        label: scene.title + (shotId ? ' · toma ' + (index + 1) : ' · ' + (index + 1)),
        source: this.agent(),
        prompt: prompt.text,
        assets,
        model: payload.model,
        modelDisplayName: takeModel.display_name || takeModel.name,
        ratio: payload.ratio ?? '',
        duration: payload.duration ?? 0,
        resolution: payload.resolution ?? takeModel.defaults?.resolutions?.[0] ?? '',
        generateAudio: payload.generate_audio ?? false,
      },
    ]);
    this.queuedPrompts.update((keys) => new Set([...keys, this.promptResourcesKey(sceneId, shotId, index)]));
  }
  /** Lleva el prompt al Studio con su proyecto cargado: si la generación está
   *  en el reel reutiliza su payload original; si no, lo arma con la config
   *  actual (modelo, overrides, storyboard y ancla del proyecto). */
  protected goToStudioFromPrompt(
    scene: StoryboardScene,
    shotId: string | null,
    index: number,
  ): void {
    const prompt = this.promptAt(scene.id, shotId, index);
    if (!prompt || !prompt.text.trim()) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.PROMPT_EMPTY'));
      return;
    }
    const take = this.takeForPrompt(scene.id, shotId, index);
    if (take?.request) {
      sessionStorage.setItem('studio:reuse', JSON.stringify(take.request));
      void this.router.navigate(['/studio']);
      return;
    }
    const model = this.activeVideoModel();
    if (!model) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_VIDEO_MODELS'));
      return;
    }
    this.error.set(null);
    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.PREPARE_PROJECT'));
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        const payload = this.videoPayloadFor(scene, shotId, index, model, project, piece);
        if (!payload) return;
        sessionStorage.setItem('studio:reuse', JSON.stringify(payload));
        void this.router.navigate(['/studio']);
      });
  }

  // ─── Modal de visualización del video generado ──────────────────

  protected readonly videoPreview = signal<{ url: string; title: string } | null>(null);

  protected openVideoPreview(url: string, title: string): void {
    this.videoPreview.set({ url, title });
  }

  protected scenePreviewTitle(sceneTitle: string, index: number, total: number): string {
    return this.translate.instant('AGENCY.STUDIO.P4_PREVIEW_SCENE_TITLE', {
      index,
      total,
      title: sceneTitle,
    });
  }

  protected shotPreviewTitle(sceneTitle: string, shotNumber: number): string {
    return this.translate.instant('AGENCY.STUDIO.P4_PREVIEW_SHOT_TITLE', {
      n: shotNumber,
      title: sceneTitle,
    });
  }

  protected closeVideoPreview(): void {
    this.videoPreview.set(null);
  }

  // ─── Chat asistente con el agente experto ────────────────────

  /** Panel de chat abierto. */
  protected readonly chatVisible = signal(false);
  /** Historial visible de la conversación con el experto. */
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  /** Texto pendiente de enviar. */
  protected readonly chatDraft = signal('');
  /** Turno en curso (deshabilita el input y el botón enviar). */
  protected readonly chatBusy = signal(false);
  /** Actividad de herramientas del asistente en el turno actual: cada
   *  invocación (consultar proyectos, generar video/imagen, etc.) aparece
   *  acá para que el usuario vea qué está haciendo el agente en vivo. */
  protected readonly chatActivity = signal<ChatToolActivity[]>([]);
  /** conversation_id por agente: cada experto mantiene su propio hilo en
   *  el back (el historial se aísla por conversación), así cambiar de
   *  experto nunca reutiliza el hilo del anterior. */
  private readonly conversationIds: Record<AgencyAgent, string> = {
    commercial: '',
    real_estate: '',
    cinema: '',
  };

  private conversationId(): string {
    return this.conversationIds[this.agent()];
  }

  private setConversationId(id: string): void {
    this.conversationIds[this.agent()] = id;
  }

  /** Cambia el experto y arranca un hilo nuevo con él: cada agente tiene
   *  su propia personalidad y su propio conversation_id. */
  protected onAgentChange(choice: AgentChoice): void {
    if (choice === INFOPRODUCT_AGENT) {
      this.writingCopilotMode.set(false);
      this.infoproductMode.set(true);
      return;
    }
    if (choice === WRITING_COPILOT_AGENT) {
      this.infoproductMode.set(false);
      this.writingCopilotMode.set(true);
      return;
    }
    this.infoproductMode.set(false);
    this.writingCopilotMode.set(false);
    const agent = choice;
    if (agent === this.agent()) return;
    this.agent.set(agent);
    this.conversationIds[agent] = '';
    this.chatMessages.set([]);
  }

  /** Alterna el panel de chat. */
  protected toggleChat(): void {
    this.chatVisible.update((open) => !open);
  }

  /** Envía el borrador al experto y agrega su respuesta en streaming. */
  protected sendChat(): void {
    const message = this.chatDraft().trim();
    if (!message || this.chatBusy()) return;
    this.chatDraft.set('');
    this.chatMessages.update((m) => [...m, { role: 'user', content: message }]);
    this.chatBusy.set(true);
    this.chatActivity.set([]);

    this.pickLlmCredential()
      .pipe(
        mergeMap((cred) => this.streamChatTurn(cred, message)),
        catchError((err: unknown) => {
          const why =
            err instanceof Error && err.message
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE');
          this.chatMessages.update((m) => [...m, { role: 'assistant', content: `⚠️ ${why}` }]);
          return EMPTY;
        }),
        finalize(() => this.chatBusy.set(false)),
      )
      .subscribe();
  }

  /** Un turno del chat: lee el SSE del experto y agrega los fragmentos
   *  de texto del asistente a medida que llegan. */
  private streamChatTurn(cred: Credential, message: string): Observable<void> {
    const token = this.session.token();
    const controller = new AbortController();
    // El turno del asistente puede encadenar varias herramientas (cada una
    // con su ida al LLM), así que el tope sube respecto del chat simple.
    const timer = setTimeout(() => controller.abort(), 120_000);

    return new Observable<void>((subscriber) => {
      fetch(this.agentChatUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: this.conversationId(),
          message,
          provider: cred.provider,
          workflow: this.agent(),
          ...(this.modelText() ? { model: this.modelForProvider(cred.provider) } : {}),
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const detail = await res.text().catch(() => '');
            throw new Error(
              detail
                ? `HTTP ${res.status}: ${detail.slice(0, 240)}`
                : `agent chat HTTP ${res.status}`,
            );
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const raw of events) {
              const parsed = parseAgentEvent(raw);
              if (!parsed) continue;
              if (parsed.name === 'meta') {
                const conv = parsed.data['conversation_id'];
                if (typeof conv === 'string') this.setConversationId(conv);
              } else if (parsed.name === 'tool') {
                this.applyToolEvent(parsed.data);
              } else if (parsed.name === 'text') {
                this.appendChatText(String(parsed.data['text'] ?? ''));
              } else if (parsed.name === 'questions') {
                // El asistente cerró el turno con preguntas: se muestran
                // como mensaje del asistente para contestarlas.
                const questions = Array.isArray(parsed.data['questions'])
                  ? (parsed.data['questions'] as unknown[]).filter(
                      (q): q is string => typeof q === 'string' && q.trim() !== '',
                    )
                  : [];
                if (questions.length > 0) {
                  this.appendChatText(
                    (this.chatMessages().length ? '\n\n' : '') +
                      questions.map((q) => `• ${q}`).join('\n'),
                  );
                }
              } else if (parsed.name === 'error') {
                throw new Error(
                  String(
                    parsed.data['message'] ??
                      this.translate.instant('AGENCY.STUDIO.ERRORS.AGENT_ERROR'),
                  ),
                );
              }
            }
          }
          subscriber.next();
          subscriber.complete();
        })
        .catch((err: unknown) => {
          const why =
            err instanceof Error && err.message
              ? err.message
              : this.translate.instant('AGENCY.STUDIO.ERRORS.NO_AGENT_RESPONSE');
          subscriber.error(new Error(why));
        })
        .finally(() => clearTimeout(timer));
    });
  }

  /** Aplica un evento SSE "tool": muestra el avance de la invocación y, si
   *  el asistente encoló una generación, la engancha a la cola compartida
   *  para que aparezca en el reel con su progreso en vivo. */
  private applyToolEvent(data: Record<string, unknown>): void {
    const name = String(data['name'] ?? '');
    const status = String(data['status'] ?? '') as ChatToolActivity['status'];
    const taskId = typeof data['task_id'] === 'string' ? data['task_id'] : '';
    const summary = typeof data['summary'] === 'string' ? data['summary'] : '';
    const error = typeof data['error'] === 'string' ? data['error'] : '';
    if (!name) return;

    // Reemplaza la entrada "running" de esta herramienta (o agrega una).
    this.chatActivity.update((list) => {
      const existing = list.findIndex((a) => a.name === name && a.status === 'running');
      const entry: ChatToolActivity = { name, status, summary, error };
      if (existing >= 0) {
        const next = [...list];
        next[existing] = entry;
        return next;
      }
      return [...list, entry];
    });

    // Generación encolada por el asistente → track global: el reel y la
    // campana la siguen con progreso en vivo, igual que una del estudio.
    if (taskId && (name === 'generate_video' || name === 'generate_image') && status === 'ok') {
      this.eventsStore.upsert({
        id: taskId,
        prompt: summary,
        modelName: '',
        modelDisplayName: this.agentLabel(),
        modelType: 'api',
        ratio: '',
        resolution: '',
        duration: 0,
        status: 'queued',
        progress: 0,
        videoUrl: null,
        error: null,
        createdAt: Date.now(),
      });
      this.eventsStore.track(taskId);
    }
  }

  /** Concatena un fragmento al último mensaje del asistente. */
  private appendChatText(text: string): void {
    this.chatMessages.update((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant') {
        return [...m.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...m, { role: 'assistant', content: text }];
    });
  }

  /** Recalcula la altura de los textareas auto-crecibles (tras rearmarlos). */
  private autogrowAll(): void {
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>('textarea[appAutogrow]').forEach((el) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
      });
    });
  }

  // ─── Popovers de generación: cola + take reel (paso 3 y paso 4) ──

  private readonly boardReelPopover = viewChild<Popover>('boardReelPopover');
  private readonly videoReelPopover = viewChild<Popover>('videoReelPopover');

  /** Cola de hojas de storyboard en curso (paso 3, sencilla). */
  protected readonly boardQueue = computed(() =>
    this.storyboard().filter((s) => s.boardGenerating),
  );

  /** Take reel simple del paso 3: hojas ya generadas con su aprobación. */
  protected readonly boardTakes = computed(() =>
    this.storyboard()
      .filter((s) => !!s.boardImageUrl)
      .map((s) => ({
        id: s.id,
        title: s.title,
        url: s.boardImageUrl ?? null,
        approved: !!s.approved,
      })),
  );

  /** Videos en cola (globales, con progreso en vivo). */
  protected readonly videoQueue = computed(() => this.eventsStore.active());

  /** Take reel del paso 4: videos ya resueltos (con calificaciones). */
  protected readonly videoTakes = computed(() =>
    this.eventsStore
      .events()
      .filter((e) => e.status !== 'queued' && e.status !== 'running')
      .slice(0, 12),
  );

  protected toggleBoardReel(event: Event): void {
    this.boardReelPopover()?.toggle(event);
  }

  protected toggleVideoReel(event: Event): void {
    this.videoReelPopover()?.toggle(event);
  }

  /** Abre el popover del paso 3 anclado a su botón (al empezar a generar). */
  private showBoardReel(): void {
    const anchor = document.getElementById('boardReelTrigger');
    if (anchor) {
      this.boardReelPopover()?.show(new MouseEvent('click'), anchor);
    }
  }

  /** Abre el popover del paso 4 anclado a su botón (al empezar a generar). */
  private showVideoReel(): void {
    const anchor = document.getElementById('videoReelTrigger');
    if (anchor) {
      this.videoReelPopover()?.show(new MouseEvent('click'), anchor);
    }
  }

  /** Califica una toma del reel ("Buena toma" / "Elegida final").
      Excluyente como en el Studio: solo puede haber una calificación o ninguna. */
  protected rateTake(take: StudioTake, kind: 'good' | 'final'): void {
    if (kind === 'good') {
      this.eventsStore.setRating(take.id, !take.ratingGood, false);
    } else {
      this.eventsStore.setRating(take.id, false, !take.ratingFinal);
    }
  }

  protected clearRating(take: StudioTake): void {
    if (!take.ratingGood && !take.ratingFinal) return;
    this.eventsStore.setRating(take.id, false, false);
  }

  /** Lleva la toma al Studio para retocarla: el request original viaja por
   *  sessionStorage y el studio carga proyecto, modelo y formato. */
  protected goToStudio(take: StudioTake): void {
    if (!take.request) {
      this.error.set(this.translate.instant('AGENCY.STUDIO.ERRORS.NO_PAYLOAD'));
      return;
    }
    sessionStorage.setItem('studio:reuse', JSON.stringify(take.request));
    void this.router.navigate(['/studio']);
  }

  /** Breve para el reel: una línea con el inicio del prompt. */
  protected shortPrompt(prompt: string): string {
    return prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
  }

  protected takeSeverity(
    status: StudioTake['status'],
  ): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
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

  protected resetWorkflow(): void {
    this.currentPhase.set('input');
    this.form.reset();
    this.selectedProjectId.set(null);
    this.projectDescription.set('');
    this.angles.update((angles) => angles.map((a) => ({ ...a, selected: false })));
    this.storyboard.set([]);
    this.boardVisible.set(false);
    this.boardSceneId.set(null);
    this.boardPrompt.set('');
    this.boardPromptEdited.set(false);
    this.videoDuration.set(10);
    this.videoRatio.set('');
    this.videoTags.set('');
    this.videoResolution.set('');
    this.videoAudio.set(true);
    this.error.set(null);
  }
}
