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

import { AgencyService } from '../../services/agency.service';
import {
  AiModel,
  ContentItem,
  Credential,
  GenerateRequest,
  Modality,
  GeneratedAsset,
  StatusResponse,
} from '../../interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project, Piece } from '@modules/events/interfaces';
import { PageContainerComponent, ValidatorErrors } from '@shared/components/index';
import { AssetEditDialogComponent } from '@shared/components/asset-edit-dialog/asset-edit-dialog';
import { UserSessionStore } from '@core/store/user.session';
import { GenerationEventsStore } from '@core/store/generation.events';
import { StudioTake } from '@modules/studio/interfaces';
import { ServerUrlPipe } from '@core/pipes';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { environment } from '@env/environment';

type WorkflowPhase = 'input' | 'angles' | 'storyboard' | 'scenes';

/** Experto que analiza el proyecto (valor = workflow del agente en el back). */
type AgencyAgent = 'commercial' | 'real_estate' | 'cinema';

const AGENT_OPTIONS: { value: AgencyAgent; label: string; hint: string }[] = [
  {
    value: 'commercial',
    label: 'Comercial publicitario',
    hint: 'Estratega comercial: propone ángulos de venta para productos y servicios.',
  },
  {
    value: 'real_estate',
    label: 'Inmobiliaria',
    hint: 'Especialista inmobiliario: ángulos para propiedades, amenidades y target.',
  },
  {
    value: 'cinema',
    label: 'Cine',
    hint: 'Director de cine: propuestas cinematográficas con luz, planos y cámara.',
  },
];

/** Encuadre del proyecto en el mensaje al agente, según el experto elegido. */
const AGENT_KIND_LABEL: Record<AgencyAgent, string> = {
  commercial: 'Proyecto comercial',
  real_estate: 'Proyecto inmobiliario',
  cinema: 'Proyecto audiovisual',
};

interface SalesAngle {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

/** Foto de referencia subida al store: su file id se adjunta a la generación. */
interface ReferenceImage {
  id: string;
  filename: string;
  url: string | null;
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
const ANGLE_TEMPLATES: { title: string; description: string }[] = [
  {
    title: 'Exclusividad y lujo',
    description:
      'Resaltar los acabados premium, amenities exclusivos y la experiencia de habitar un espacio único.',
  },
  {
    title: 'Inversión inteligente',
    description:
      'Enfocarse en la rentabilidad, plusvalía, ubicación estratégica y potencial de crecimiento.',
  },
  {
    title: 'Estilo de vida',
    description: 'Mostrar cómo es vivir ahí: entorno, comodidad, comunidad, cercanía a servicios.',
  },
  {
    title: 'Ubicación y conectividad',
    description:
      'Destacar cercanía a transportes, comercios, escuelas y puntos de interés de la zona.',
  },
  {
    title: 'Sostenibilidad y diseño',
    description:
      'Resaltar eficiencia energética, materiales sustentables, espacios verdes y diseño contemporáneo.',
  },
];

/** Fotos sugeridas por tipo de ángulo: keywords sobre título + descripción.
 *  Ej.: "lujo" → acabados, salón de reuniones, alcoba; "seguridad" → portón,
 *  equipo de seguridad. Primera coincidencia que matchea manda. */
const REFERENCE_SUGGESTIONS: { keywords: string[]; items: string[] }[] = [
  // Especialización por escena: elementos concretos de los planos y tomas.
  {
    keywords: ['fachada', 'entrada', 'exterior', 'atardecer', 'torre'],
    items: ['la fachada al atardecer', 'la entrada principal', 'la vista de la torre'],
  },
  {
    keywords: ['cocina', 'comedor'],
    items: ['la cocina terminada', 'los detalles de la isla de cocina'],
  },
  {
    keywords: ['lobby', 'recepci', 'reuniones', 'salón', 'salon'],
    items: ['el lobby de acceso', 'el salón de reuniones'],
  },
  {
    keywords: ['alcoba', 'dormitorio', 'habitaci'],
    items: ['la alcoba principal', 'el detalle de la ventana'],
  },
  {
    keywords: ['piscina', 'gimnasio', 'jardín', 'jardin', 'terraza', 'deck'],
    items: ['la piscina', 'la terraza y el jardín'],
  },
  // Marco del ángulo: el contexto general del que nace la escena.
  {
    keywords: ['lujo', 'premium', 'exclusiv', 'acabado', 'amenit'],
    items: [
      'los acabados premium',
      'el salón de reuniones',
      'la alcoba principal',
      'las amenidades exclusivas',
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
    items: [
      'el portón del edificio',
      'el equipo de seguridad',
      'el acceso controlado y las cámaras',
    ],
  },
  {
    keywords: ['inversi', 'rentab', 'plusval', 'financ', 'oportunidad'],
    items: ['la fachada del edificio', 'las vistas panorámicas', 'la zona en desarrollo'],
  },
  {
    keywords: ['estilo de vida', 'comunidad', 'entorno', 'familiar', 'barrio', 'vecin'],
    items: ['las áreas comunes', 'la vida en la comunidad', 'el entorno del barrio'],
  },
  {
    keywords: ['ubicaci', 'conectiv', 'transporte', 'accesibil'],
    items: ['la vista de la zona', 'los transportes cercanos', 'los puntos de interés'],
  },
  {
    keywords: ['sosten', 'diseñ', 'disen', 'energ', 'verde', 'natural', 'ecol'],
    items: ['los espacios verdes', 'los materiales sustentables', 'el diseño contemporáneo'],
  },
];

const DEFAULT_REFERENCE_SUGGESTIONS = [
  'la fachada del edificio',
  'las áreas comunes',
  'la vista general del proyecto',
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

/** Convierte el artefacto sales_angles del agente en ángulos del flujo. */
function anglesFromAgent(data: Record<string, unknown>, count: number): SalesAngle[] {
  const raw = Array.isArray(data['angles']) ? (data['angles'] as Record<string, unknown>[]) : [];
  return raw.slice(0, count).map((a, i) => ({
    id: `angle-${i + 1}`,
    title: String(a['title'] ?? `Ángulo ${i + 1}`),
    description: [a['hook'], a['narrative_pitch'], a['target_audience']]
      .filter((v) => typeof v === 'string' && v.trim() !== '')
      .join(' — '),
    selected: !!a['selected'],
  }));
}

/** Arma la lista de ángulos a crear (1–10), rotando las plantillas. */
function buildAngles(count: number): SalesAngle[] {
  const n = Math.min(Math.max(Math.round(count) || 3, 1), 10);
  return Array.from({ length: n }, (_, i) => {
    const template = ANGLE_TEMPLATES[i % ANGLE_TEMPLATES.length];
    return {
      id: `angle-${i + 1}`,
      title: `Ángulo ${i + 1} — ${template.title}`,
      description: template.description,
      selected: false,
    };
  });
}

@Component({
  selector: 'app-agency',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    PageContainerComponent,
    ValidatorErrors,
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
    ServerUrlPipe,
    AssetEditDialogComponent,
  ],
  templateUrl: './agency.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly eventsService = inject(EventsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly session = inject(UserSessionStore);
  /** Copia la hoja de storyboard al store para usarla como referencia de video. */
  private readonly libraryService = inject(LibraryService);
  /** Cola global y take reel de generaciones (compartido con el studio). */
  private readonly eventsStore = inject(GenerationEventsStore);
  private readonly router = inject(Router);

  protected readonly currentPhase = signal<WorkflowPhase>('input');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(0);

  /** Experto elegido para analizar el proyecto (default: comercial). */
  protected readonly agent = signal<AgencyAgent>('commercial');
  protected readonly agentOptions = AGENT_OPTIONS;
  protected readonly agentLabel = computed(
    () => AGENT_OPTIONS.find((o) => o.value === this.agent())?.label ?? 'Comercial publicitario',
  );
  protected readonly agentHint = computed(
    () => AGENT_OPTIONS.find((o) => o.value === this.agent())?.hint ?? '',
  );
  /** Placeholder del contexto, adaptado al experto elegido. */
  protected readonly descriptionPlaceholder = computed(() => {
    const tail =
      'Esta descripción, junto a los insumos que cargues, me dará el contexto necesario para darte una mejor respuesta.';
    switch (this.agent()) {
      case 'real_estate':
        return (
          'Describe brevemente tu proyecto (puntos fuertes del proyecto inmobiliario, ' +
          `amenidades, precio promedio, target del cliente, etc). ${tail}`
        );
      case 'cinema':
        return (
          'Describe brevemente tu proyecto (temática, idea escueta del video, guion, ' +
          `tono, referencias visuales, etc). ${tail}`
        );
      default:
        return (
          'Describe brevemente tu proyecto (de qué va el comercial, target del cliente, ' +
          `puntos fuertes del producto o servicio, guion del comercial, etc). ${tail}`
        );
    }
  });

  /** Nombre del paso 2 según el experto: ángulos (inmobiliaria) o prompts. */
  protected readonly anglesStepName = computed(() =>
    this.agent() === 'real_estate' ? 'Ángulos' : 'Prompts',
  );
  /** Sustantivo en minúscula para las frases del flujo. */
  protected readonly anglesNoun = computed(() =>
    this.agent() === 'real_estate' ? 'ángulos de venta' : 'prompts',
  );

  protected readonly phases = computed<{ key: WorkflowPhase; name: string }[]>(() => [
    { key: 'input', name: 'Documentación' },
    { key: 'angles', name: this.anglesStepName() },
    { key: 'storyboard', name: 'Storyboard' },
    { key: 'scenes', name: 'Escenas' },
  ]);

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
  /** Ángulos: catálogo de texto + los modelos LLM guardados en admin/models
   *  (openrouter/anthropic extra.model), que es donde se configuran. */
  protected readonly modelTextOptions = computed(() => {
    const options = this.modelOptionsFor('text');
    const known = new Set(options.map((o) => o.value));
    for (const cred of this.credentials()) {
      if (cred.provider !== 'openrouter' && cred.provider !== 'anthropic') continue;
      const model = this.credentialModel(cred);
      if (model && !known.has(model)) {
        known.add(model);
        options.push({ label: `${model} · ${cred.provider}`, value: model });
      }
    }
    return options;
  });
  protected readonly modelImageOptions = computed(() => this.modelOptionsFor('image'));
  protected readonly modelVideoOptions = computed(() => this.modelOptionsFor('video'));
  protected readonly projectDescription = signal('');
  protected readonly angles = signal<SalesAngle[]>(buildAngles(3));
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
      { label: 'Automática (default del modelo)', value: '' },
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
      { label: 'Automática (default del modelo)', value: '' },
      ...ratios.map((r) => ({ label: r, value: r })),
    ];
  });

  /** Calidades (resoluciones) que soporta el modelo de video activo. */
  protected readonly videoResolutionOptions = computed(() => {
    const resolutions = this.activeVideoModel()?.defaults?.resolutions ?? [];
    return [
      { label: 'Automática (default del modelo)', value: '' },
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

    // Catálogo de modelos (por modalidad) para los selectores de cada paso.
    this.agencyService
      .listModels()
      .pipe(catchError(() => EMPTY))
      .subscribe((models) => this.models.set(models));

    // Credenciales: aportan el modelo LLM configurado en Admin → Modelos.
    this.agencyService
      .listCredentials()
      .pipe(catchError(() => EMPTY))
      .subscribe((creds) => this.credentials.set(creds ?? []));

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
    return ['propertyName', 'location', 'description'].every(
      (key) => String(raw[key] ?? '').trim() !== '',
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
          this.error.set(`No se pudo extraer texto de ${file.name} (¿PDF escaneado como imagen?).`);
          return;
        }
        this.appendBriefText(result.text);
        added.push(result.filename || file.name);
        truncated = truncated || result.truncated;
      }
      this.briefNote.set(
        `Texto de ${added.join(', ')} agregado a la descripción` +
          (truncated ? ' (recortado a 8.000 caracteres)' : ''),
      );
    } catch (err) {
      // HttpErrorResponse trae el mensaje del back en err.error.message.
      const wrapped = err as { message?: string; error?: { message?: string } };
      const message = wrapped?.error?.message || wrapped?.message || '';
      this.error.set(message || 'No se pudo extraer el texto del folleto.');
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

  protected get canProceedToStoryboard(): boolean {
    return this.selectedAnglesCount > 0;
  }

  /** Todas las escenas tienen su hoja de storyboard cargada y aprobada:
   *  es la condición para entrar al paso Escenas. */
  protected get canProceedToScenes(): boolean {
    const scenes = this.storyboard();
    return scenes.length > 0 && scenes.every((s) => !!s.boardImageUrl && !!s.approved);
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
        return this.canProceedToAngles;
      case 'storyboard':
        return this.canProceedToStoryboard;
      case 'scenes':
        return this.canProceedToScenes;
    }
  }

  private phaseBlockedMessage(phase: WorkflowPhase): string {
    switch (phase) {
      case 'angles':
        return 'Completá los datos del proyecto para ver los ángulos.';
      case 'storyboard':
        return 'Seleccioná al menos un ángulo para ver el storyboard.';
      case 'scenes':
        return 'Aprobá el storyboard de todas las escenas para continuar.';
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
    const phases: WorkflowPhase[] = ['input', 'angles', 'storyboard', 'scenes'];
    const currentIndex = phases.indexOf(this.currentPhase());
    if (currentIndex < phases.length - 1) {
      const next = phases[currentIndex + 1];
      if (next === 'scenes' && !this.canProceedToScenes) {
        this.error.set('Aprobá el storyboard de todas las escenas para continuar.');
        return;
      }
      this.currentPhase.set(next);
      if (next === 'scenes') this.ensureVideoPrompts();
      this.focusPhaseHeading();
      // Cada avance se guarda en el proyecto (evita reprocesos).
      this.persistWorkflow();
    }
  }

  protected prevPhase(): void {
    const phases: WorkflowPhase[] = ['input', 'angles', 'storyboard', 'scenes'];
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
    // Inmobiliaria pide un número fijo; con los otros agentes el experto
    // define cuántos necesita (tope 10 para no recortar su respuesta).
    const fixed = this.agent() === 'real_estate';
    const count = fixed
      ? Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3
      : 10;
    this.angles.set(buildAngles(count));

    this.loading.set(true);
    this.error.set(null);

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
              : 'No se pudieron guardar los datos del proyecto.';
          this.error.set(why);
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((anglesList) => {
        this.angles.set(anglesList);
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
      return throwError(() => new Error('Nombre de proyecto vacío'));
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

  /** Avanza al paso Storyboard: conserva las escenas ya armadas (con sus
   *  fotos, hojas y aprobaciones) y solo crea las dos escenas plantilla
   *  para los ángulos nuevos. Así volver atrás y pulsar Siguiente no revive
   *  escenas eliminadas ni pisa el avance. */
  protected generateStoryboard(): void {
    const selectedAngles = this.angles().filter((a) => a.selected);
    const previous = this.storyboard();
    const scenes = selectedAngles.flatMap((angle) => this.scenesForAngle(angle, previous));
    this.storyboard.set(this.renumberScenes(scenes));
    this.nextPhase();
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
      this.error.set('Aprobá las fotos de referencia de la escena para generar imágenes.');
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
    this.boardPrompt.set(this.buildBoardPrompt(scene, count));
    this.error.set(null);
    this.boardVisible.set(true);
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

  /** Narrativa de las fotos reales subidas para el ángulo de la escena:
   *  con esos datos se describe qué elementos reales debe integrar el dibujo
   *  del storyboard y cada toma del video. */
  private referenceNarrative(scene: StoryboardScene): string | null {
    if (!scene.references?.length) return null;
    const items = this.sceneSuggestions(scene.id);
    const files = scene.references.map((r) => r.filename).join(', ');
    return `Fotos reales asignadas a la escena (${files}): ${items.join(', ')}. Integrar esos elementos en la acción y respetar su apariencia.`;
  }

  /** Prompt por defecto de la hoja: N viñetas tipo cómic, cada una con
   *  TIPO DE TOMA / ENCUADRE y sonido o diálogo al pie (ver ejemplo). */
  private buildBoardPrompt(scene: StoryboardScene, tomas: number): string {
    const shots = Array.from({ length: tomas }, (_, i) => {
      const shot = scene.shots[i];
      return `${i + 1}) ${shot?.description?.trim() || `Toma ${i + 1} — ${scene.title}`}`;
    }).join(' ');
    const lines = [
      `Hoja de storyboard dibujada a lápiz en blanco y negro, con ${tomas} viñetas en cuadrícula para la escena "${scene.title}"${scene.angleTitle ? ` del ángulo "${scene.angleTitle}"` : ''}.`,
      'Cada viñeta lleva encabezado con el título de la escena, "TIPO DE TOMA:" y "ENCUADRE:" en mayúsculas, el dibujo narrativo de la acción y al pie el sonido o diálogo correspondiente.',
      `Acción de la escena: ${scene.description}`,
      `Tomas: ${shots}`,
    ];
    const references = this.referenceNarrative(scene);
    if (references) lines.push(references);
    lines.push('Estilo storyboard de cine: líneas de entintado y sombreado a lápiz, sin color.');
    return lines.join(' ');
  }

  /** Genera la imagen-guía (hoja con varias viñetas) de la escena abierta. */
  protected submitBoardImage(): void {
    const scene = this.boardScene();
    const prompt = this.boardPrompt().trim();
    if (!scene || scene.boardGenerating) return;
    if (!prompt) {
      this.error.set('Escribí el prompt del storyboard.');
      return;
    }
    const imageModels = this.models().filter((m) => m.modality === 'image');
    const model = imageModels.find((m) => m.name === this.modelImage()) ?? imageModels[0];
    if (!model) {
      this.error.set('No hay modelos de imagen disponibles.');
      return;
    }
    const count = this.boardShotCount();
    const ratio = this.boardRatio();
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
          this.error.set('No se pudo preparar el proyecto de la Agencia.');
          setGenerating(false);
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        this.agencyService
          .generate('image', {
            model: model.name,
            content: [{ type: 'text', text: prompt }],
            ...(ratio ? { ratio } : {}),
            event_id: project.id,
            piece_id: piece.id,
            piece_code: piece.piece_code ?? `SCENE-${scene.id.toUpperCase()}`,
            generation_number: 1,
          })
          .pipe(
            catchError(() => {
              this.error.set(`Error al generar el storyboard de ${scene.title}.`);
              setGenerating(false);
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.agencyService
              .pollTaskUntilDone('image', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(`Error al consultar el storyboard de ${scene.title}.`);
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
                  this.error.set('La generación no produjo imagen. Reintentá.');
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
            this.error.set('No se pudo cargar la hoja de storyboard para editar.');
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

  /** Opciones de modelo para una modalidad ('Automático' = default del back). */
  private modelOptionsFor(modality: Modality): { label: string; value: string }[] {
    const list = this.models()
      .filter((m) => m.modality === modality)
      .map((m) => ({ label: m.display_name || m.name, value: m.name }));
    return [{ label: 'Automático', value: '' }, ...list];
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

  /** Ángulos de venta: los genera el LLM elegido (credencial del tenant) vía
   *  el agente. Sin credencial o sin respuesta el observable falla: no se
   *  rellena con plantillas, porque ángulos inventados no son producto. */
  private generateAnglesWithAgent(count: number): Observable<SalesAngle[]> {
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
      mergeMap((cred) => {
        if (!cred) {
          return throwError(
            () =>
              new Error(
                'Sin credencial LLM (openrouter/anthropic) en Admin → Credenciales: no se generaron ángulos.',
              ),
          );
        }
        return this.requestAgentAngles(cred, count);
      }),
    );
  }

  private requestAgentAngles(cred: Credential, count: number): Observable<SalesAngle[]> {
    const raw = this.form.getRawValue() as {
      propertyName: string;
      location: string;
      description: string;
    };
    const agent = this.agent();
    const message = [
      `${AGENT_KIND_LABEL[agent]}: ${raw.propertyName} (${raw.location}).`,
      raw.description,
      agent === 'real_estate'
        ? `Generá ${count} ángulos de venta y detené el flujo ahí.`
        : 'Generá los ángulos necesarios para comunicar el guion y detené el flujo ahí.',
    ].join(' ');
    const token = this.session.token();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);

    return new Observable<SalesAngle[]>((subscriber) => {
      fetch(`${environment.API_URL}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: '',
          message,
          provider: cred.provider,
          workflow: this.agent(),
          ...(this.modelText() ? { model: this.modelText() } : {}),
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
              if (parsed?.name === 'sales_angles') {
                controller.abort();
                const mapped = anglesFromAgent(parsed.data, count);
                if (mapped.length > 0) {
                  // Solo ángulos reales: si el LLM devolvió menos de los
                  // pedidos se muestran esos, sin completar con plantillas.
                  subscriber.next(mapped);
                  subscriber.complete();
                  return;
                }
              }
            }
          }
          throw new Error('sin sales_angles en la respuesta');
        })
        .catch((err: unknown) => {
          const why =
            err instanceof Error && err.message ? err.message : 'sin respuesta del agente';
          subscriber.error(new Error(`No se generaron los ángulos: ${why}`));
        })
        .finally(() => clearTimeout(timer));
    });
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
      this.angles.set(buildAngles(count));
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
            prompts,
            shots,
          };
        }),
      );
    }
    if (typeof agency['projectDescription'] === 'string') {
      this.projectDescription.set(String(agency['projectDescription']));
    }
    const phase = agency['phase'];
    if (typeof phase === 'string' && this.phases().some((p) => p.key === phase)) {
      this.currentPhase.set(phase as WorkflowPhase);
    }
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
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return DEFAULT_REFERENCE_SUGGESTIONS;
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
      for (const item of group.items) {
        if (!items.includes(item)) items.push(item);
      }
    }
    return items.length ? items.slice(0, 5) : DEFAULT_REFERENCE_SUGGESTIONS;
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
          this.error.set('No se pudo cargar el recurso para editar.');
          return EMPTY;
        }),
        finalize(() => this.editorLoading.set(false)),
      )
      .subscribe((asset) => {
        if (!asset) {
          this.error.set('No se pudo cargar el recurso para editar.');
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
      this.error.set('No se encontró la escena para guardar las fotos de referencia.');
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
            this.error.set(`No se pudo subir ${file.name}.`);
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

  /** Al entrar al paso Escenas cada storyboard aprobado tiene sus prompts. */
  private ensureVideoPrompts(): void {
    const segments = this.videoSegmentCount();
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
    const segments = this.videoSegmentCount();
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
    const shotIndex = shot ? scene.shots.indexOf(shot) : -1;
    const lines: string[] =
      shotIndex >= 0
        ? [
            `TOMA ${shotIndex + 1}/${scene.shots.length} — "${scene.title}": ${shot?.description ?? ''}`,
            `Referencia visual: viñeta ${shotIndex + 1} del storyboard guía (imagen adjunta). Mantener encuadre, iluminación y estilo del dibujo.`,
          ]
        : [
            `ESCENA "${scene.title}"${scene.angleTitle ? ` — ángulo "${scene.angleTitle}"` : ''}: ${scene.description}`,
            'Referencia visual: hoja de storyboard guía (imagen adjunta). Animar la secuencia respetando encuadres, iluminación y estilo de las viñetas.',
          ];
    const references = this.referenceNarrative(scene);
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
    patch: { duration?: number; resolution?: string; audio?: boolean },
  ): void {
    const prompt = this.promptAt(sceneId, shotId, index);
    if (!prompt) return;
    const duration = patch.duration ?? prompt.duration ?? null;
    const resolution =
      patch.resolution !== undefined ? patch.resolution : (prompt.resolution ?? null);
    const audio = patch.audio ?? prompt.audio ?? null;
    const text = this.replaceSpecLine(
      prompt.text,
      // null/undefined → manda la config global; '' explícito = Automática.
      this.specLine(
        duration ?? this.segmentDuration(index),
        this.videoRatio(),
        resolution ?? undefined,
        audio,
      ),
    );
    this.patchPrompt(sceneId, shotId, index, { duration, resolution, audio, text });
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
    const segments = this.videoSegmentCount();
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

  /** Recursos asignados a cualquier prompt de la escena: la hoja de
   *  storyboard (si su archivo se subió al store) más las fotos de referencia
   *  de la escena, que quedan como ingredientes del video.
   *  Espeja el `content` que arma generatePromptVideo. */
  protected promptResources(scene: StoryboardScene): {
    id: string;
    name: string;
    url: string | null;
  }[] {
    const items: { id: string; name: string; url: string | null }[] = [];
    if (scene.boardFileId) {
      items.push({
        id: scene.boardFileId,
        name: `storyboard-${scene.id}.png`,
        url: scene.boardImageUrl ?? null,
      });
    }
    for (const ref of this.referencesOfScene(scene.id)) {
      if (ref.id !== scene.boardFileId) {
        items.push({ id: ref.id, name: ref.filename, url: ref.url });
      }
    }
    return items;
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
      this.error.set('No hay modelos de video disponibles.');
      return;
    }
    const ratio = this.videoRatio() || model.defaults?.ratios?.[0] || '';
    // Slot único por prompt (escenas 1..N, tomas 101..N): así no se pisan
    // entre sí al guardarse en la pieza (SaveGeneration desactiva el mismo nro).
    const generationNumber = shotId ? (shotIndex + 1) * 100 + index + 1 : index + 1;

    this.error.set(null);
    this.patchPrompt(sceneId, shotId, index, { generating: true });
    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto de la Agencia.');
          this.patchPrompt(sceneId, shotId, index, { generating: false });
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        const content: ContentItem[] = [{ type: 'text', text: prompt.text }];
        if (scene.boardFileId) {
          content.push({
            type: 'image',
            id: scene.boardFileId,
            name: `storyboard-${scene.id}.png`,
          });
        }
        // Fotos reales de la escena: quedan como ingredientes del video
        // junto a la hoja de storyboard.
        for (const ref of this.referencesOfScene(sceneId)) {
          if (ref.id !== scene.boardFileId) {
            content.push({ type: 'image', id: ref.id, name: ref.filename });
          }
        }
        const duration = prompt.duration ?? this.segmentDuration(index);
        const resolution = prompt.resolution ?? this.videoResolution();
        const audio = prompt.audio ?? this.videoAudio();
        const payload: GenerateRequest = {
          model: model.name,
          content,
          ...(ratio ? { ratio } : {}),
          duration,
          ...(resolution ? { resolution } : {}),
          generate_audio: audio,
          event_id: project.id,
          piece_id: piece.id,
          piece_code: piece.piece_code ?? `SCENE-${sceneId.toUpperCase()}`,
          generation_number: generationNumber,
        };
        // Take en la cola/take reel (paso 4): el popover lo sigue en vivo aunque
        // este botón se resetee, y su estado manda hasta que la tarea resuelva.
        const takeId = `pending_${Date.now()}`;
        this.eventsStore.upsert({
          id: takeId,
          prompt: prompt.text,
          modelName: model.name,
          modelDisplayName: model.display_name || model.name,
          modelType: 'api',
          ratio,
          resolution: resolution || model.defaults?.resolutions?.[0] || '',
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
              this.error.set(`Error al generar el video de ${scene.title}.`);
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
            this.agencyService
              .pollTaskUntilDone('video', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(`Error al consultar el video de ${scene.title}.`);
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
                      ? `El video de ${scene.title} falló: ${status.error ?? 'reintentá.'}`
                      : `La generación del video de ${scene.title} fue cancelada.`,
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

  /** Califica una toma del reel ("Buena toma" / "Elegida final"). */
  protected rateTake(take: StudioTake, kind: 'good' | 'final'): void {
    const good = kind === 'good' ? !take.ratingGood : !!take.ratingGood;
    const final = kind === 'final' ? !take.ratingFinal : !!take.ratingFinal;
    this.eventsStore.setRating(take.id, good, final);
  }

  protected clearRating(take: StudioTake): void {
    if (!take.ratingGood && !take.ratingFinal) return;
    this.eventsStore.setRating(take.id, false, false);
  }

  /** Lleva la toma al Studio para retocarla: el request original viaja por
   *  sessionStorage y el studio carga proyecto, modelo y formato. */
  protected goToStudio(take: StudioTake): void {
    if (!take.request) {
      this.error.set('Esta generación no tiene payload de origen para retocar en el Studio.');
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
