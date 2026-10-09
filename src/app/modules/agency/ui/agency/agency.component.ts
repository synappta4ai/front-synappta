import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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

import { AgencyService } from '../../services/agency.service';
import {
  AiModel,
  ContentItem,
  Credential,
  Modality,
  GeneratedAsset,
  StatusResponse,
} from '../../interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project, Piece } from '@modules/events/interfaces';
import { PageContainerComponent, ValidatorErrors } from '@shared/components/index';
import { AssetEditDialogComponent } from '@shared/components/asset-edit-dialog/asset-edit-dialog';
import { UserSessionStore } from '@core/store/user.session';
import { ServerUrlPipe } from '@core/pipes';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { environment } from '@env/environment';

type WorkflowPhase = 'input' | 'angles' | 'storyboard' | 'scenes';

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
   *  aprobadas, habilitan "Generar imágenes". */
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
    keywords: ['seguridad', 'vigilanc', 'portón', 'porton', 'cámara', 'camara', 'control de acceso'],
    items: ['el portón del edificio', 'el equipo de seguridad', 'el acceso controlado y las cámaras'],
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

  protected readonly currentPhase = signal<WorkflowPhase>('input');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(0);

  protected readonly phases = [
    { key: 'input' as WorkflowPhase, name: 'Documentación' },
    { key: 'angles' as WorkflowPhase, name: 'Ángulos' },
    { key: 'storyboard' as WorkflowPhase, name: 'Storyboard' },
    { key: 'scenes' as WorkflowPhase, name: 'Escenas' },
  ];

  protected readonly phaseIndex = computed(() =>
    this.phases.findIndex((p) => p.key === this.currentPhase()),
  );

  protected readonly stepItems = computed<MenuItem[]>(() =>
    this.phases.map((phase, i) => ({
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
  /** Cantidad de tomas sugerida en la modal (una toma por viñeta). */
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
  /** Tags de referencia que se inyectan en todos los prompts. */
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
      const project = id ? this.projects().find((p) => p.id === id) ?? null : null;
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
    // "Generar Storyboard" nunca se habilitaba).
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
    if (phase === 'scenes' && !this.canProceedToScenes) {
      this.error.set('Aprobá el storyboard de todas las escenas para continuar.');
      return;
    }
    this.error.set(null);
    this.currentPhase.set(phase);
    if (phase === 'scenes') this.ensureVideoPrompts();
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
      // Cada avance se guarda en el proyecto (evita reprocesos).
      this.persistWorkflow();
    }
  }

  protected prevPhase(): void {
    const phases: WorkflowPhase[] = ['input', 'angles', 'storyboard', 'scenes'];
    const currentIndex = phases.indexOf(this.currentPhase());
    if (currentIndex > 0) {
      this.currentPhase.set(phases[currentIndex - 1]);
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

  /** Click o tecla sobre la card de un ángulo: alterna el tildado. Se ignora
   *  cuando el evento nace en un campo editable (título/descripción), para
   *  poder escribir sin tildar y tildar desde cualquier otra zona de la card
   *  (el checkbox es decorativo: la card entera es el control). */
  protected onAngleCardActivate(angleId: string, event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.type === 'keydown') event.preventDefault();
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
    // Los ángulos a crear salen del input numérico (por defecto 3).
    const count = Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3;
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
          // Ángulos: modelo LLM elegido en el paso 1 (fallback = plantillas).
          return this.generateAnglesWithAgent(count);
        }),
        catchError(() => {
          this.error.set('No se pudieron guardar los datos del proyecto.');
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

  protected generateStoryboard(): void {
    const selectedAngles = this.angles().filter((a) => a.selected);
    const scenes: StoryboardScene[] = selectedAngles.flatMap((angle, i) => [
      {
        id: `scene-${i}-1`,
        angleId: angle.id,
        angleTitle: angle.title,
        title: `Escena ${i + 1}: ${angle.title}`,
        description: `Plano general del proyecto destacando ${angle.description.toLowerCase()}`,
        references: [],
        refsApproved: false,
        shots: [
          {
            id: `shot-${i}-1-1`,
            description: 'Plano general — fachada principal al atardecer',
            imageUrl: null,
            generating: false,
          },
          {
            id: `shot-${i}-1-2`,
            description: 'Plano medio — lobby y áreas comunes',
            imageUrl: null,
            generating: false,
          },
        ],
      },
      {
        id: `scene-${i}-2`,
        angleId: angle.id,
        angleTitle: angle.title,
        title: `Escena ${i + 2}: Detalle`,
        description: `Primer plano de acabados y acabados premium del ${angle.title}`,
        references: [],
        refsApproved: false,
        shots: [
          {
            id: `shot-${i}-2-1`,
            description: 'Primer plano — acabados de cocina',
            imageUrl: null,
            generating: false,
          },
        ],
      },
    ]);

    this.storyboard.set(scenes);
    this.nextPhase();
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

  /** Cambia la cantidad de tomas sugerida; si el prompt no se editó a mano
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
    return `Fotos reales de referencia de la escena: ${items.join(', ')}. Integrar esos elementos en la acción y respetar su apariencia.`;
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
        scenes.map((s) => (s.id === scene.id ? { ...s, boardGenerating: generating, ...patch } : s)),
      );

    // La cantidad de tomas de la modal manda sobre la lista de tomas.
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === scene.id ? { ...s, shots: this.resizeShots(s, count) } : s)),
    );
    setGenerating(true);
    this.error.set(null);

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
        const found = (res?.items ?? []).find((f) =>
          f.filename?.startsWith(`${nameQuery}.`),
        );
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
   *  el agente; sin credencial o sin respuesta → plantillas locales. */
  private generateAnglesWithAgent(count: number): Observable<SalesAngle[]> {
    return this.agencyService.listCredentials().pipe(
      map(
        (creds) =>
          creds.find(
            (c) =>
              !!c.api_key_mask && (c.provider === 'openrouter' || c.provider === 'anthropic'),
          ) ?? null,
      ),
      mergeMap((cred) => (cred ? this.requestAgentAngles(cred, count) : of(buildAngles(count)))),
      catchError(() => of(buildAngles(count))),
    );
  }

  private requestAgentAngles(cred: Credential, count: number): Observable<SalesAngle[]> {
    const raw = this.form.getRawValue() as {
      propertyName: string;
      location: string;
      description: string;
    };
    const message = [
      `Proyecto inmobiliario: ${raw.propertyName} (${raw.location}).`,
      raw.description,
      `Generá ${count} ángulos de venta y detené el flujo ahí.`,
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
          workflow: 'real_estate',
          ...(this.modelText() ? { model: this.modelText() } : {}),
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            throw new Error(`agent chat HTTP ${res.status}`);
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
                  const rest = buildAngles(count).slice(mapped.length);
                  subscriber.next([...mapped, ...rest]);
                  subscriber.complete();
                  return;
                }
              }
            }
          }
          throw new Error('sin sales_angles en la respuesta');
        })
        .catch(() => {
          subscriber.next(buildAngles(count));
          subscriber.complete();
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
      anglesCount: Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3,
      models: { text: this.modelText(), image: this.modelImage(), video: this.modelVideo() },
      videoSettings: {
        duration: this.videoDuration(),
        ratio: this.videoRatio(),
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
      const count =
        Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3;
      this.angles.set(buildAngles(count));
      this.storyboard.set([]);
      this.modelText.set('');
      this.modelImage.set('');
      this.modelVideo.set('');
      this.videoDuration.set(10);
      this.videoRatio.set('');
      this.videoTags.set('');
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

    const models = (agency['models'] ?? {}) as { text?: string; image?: string; video?: string };
    this.modelText.set(models.text ?? '');
    this.modelImage.set(models.image ?? '');
    this.modelVideo.set(models.video ?? '');

    const videoSettings = (agency['videoSettings'] ?? {}) as {
      duration?: number;
      ratio?: string;
      tags?: string;
    };
    if (Number.isFinite(videoSettings.duration) && (videoSettings.duration ?? 0) > 0) {
      this.videoDuration.set(Math.round(videoSettings.duration as number));
    }
    this.videoRatio.set(videoSettings.ratio ?? '');
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
    if (typeof phase === 'string' && this.phases.some((p) => p.key === phase)) {
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

  /** Gate: sin referencias aprobadas no se habilita "Generar imágenes". */
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
   *  (el gate de "Generar imágenes" se cierra) y rearma la narrativa. */
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
   *  "Generar imágenes". */
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
    const pending = this
      .storyboard()
      .some(
        (s) =>
          (s.prompts?.length ?? 0) !== segments ||
          s.shots.some((sh) => (sh.prompts?.length ?? 0) !== segments),
      );
    if (pending) this.generatePrompts();
  }

  /** Rearma los prompts de cada escena y de cada toma según la configuración
   *  actual (modelo, duración, ratio, tags). Los videos ya generados se
   *  conservan por índice. */
  protected generatePrompts(): void {
    const segments = this.videoSegmentCount();
    const tags = this.videoTags().trim();
    const ratio = this.videoRatio();
    this.storyboard.update((scenes) =>
      scenes.map((scene) => ({
        ...scene,
        prompts: this.buildPrompts(scene, null, segments, tags, ratio),
        shots: scene.shots.map((shot) => ({
          ...shot,
          prompts: this.buildPrompts(scene, shot, segments, tags, ratio),
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
  ): VideoPrompt[] {
    const previous = (shot ? shot.prompts : scene.prompts) ?? [];
    return Array.from({ length: segments }, (_, i) => ({
      text: this.buildPromptText(scene, shot, i, segments, tags, ratio),
      videoUrl: previous[i]?.videoUrl ?? null,
      generating: false,
    }));
  }

  /** Texto de un prompt: escena/toma + referencia al storyboard + tags de
   *  referencia + segmento y duración. */
  private buildPromptText(
    scene: StoryboardScene,
    shot: StoryboardShot | null,
    index: number,
    segments: number,
    tags: string,
    ratio: string,
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
    lines.push(`Duración ${this.segmentDuration(index)}s${ratio ? ` · Relación de aspecto ${ratio}` : ''}.`);
    return lines.join('\n');
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

  /** Cambió la config de video: el ratio debe pertenecer al modelo activo y,
   *  si cambió la cantidad de segmentos, se rearmán los prompts (los videos
   *  ya generados se conservan por índice). */
  protected onVideoConfigChange(): void {
    const options = this.videoRatioOptions();
    if (!options.some((o) => o.value === this.videoRatio())) {
      this.videoRatio.set(options[0]?.value ?? '');
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
          ? { ...s, prompts: (s.prompts ?? []).map((p, i) => (i === index ? { ...p, text: value } : p)) }
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
          shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, prompts: applyPatch(sh.prompts) } : sh)),
        };
      }),
    );
  }

  /** Genera el video de un prompt (de la escena o de una toma): texto del
   *  prompt + hoja de storyboard como imagen de referencia, duración del
   *  segmento y ratio del modelo. */
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
          content.push({ type: 'image', id: scene.boardFileId, name: `storyboard-${scene.id}.png` });
        }
        // Fotos reales del ángulo: solo cuando el modelo expone ruta
        // multi-referencia verificada, para no sacarlo de su ruta i2v de
        // imagen única (donde la hoja dejaría de adjuntarse).
        if (model.reference_endpoint) {
          for (const ref of this.referencesOfScene(sceneId)) {
            if (ref.id !== scene.boardFileId) {
              content.push({ type: 'image', id: ref.id, name: ref.filename });
            }
          }
        }
        this.agencyService
          .generate('video', {
            model: model.name,
            content,
            ...(ratio ? { ratio } : {}),
            duration: this.segmentDuration(index),
            event_id: project.id,
            piece_id: piece.id,
            piece_code: piece.piece_code ?? `SCENE-${sceneId.toUpperCase()}`,
            generation_number: generationNumber,
          })
          .pipe(
            catchError(() => {
              this.error.set(`Error al generar el video de ${scene.title}.`);
              this.patchPrompt(sceneId, shotId, index, { generating: false });
              return EMPTY;
            }),
          )
          .subscribe((response) => {
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
    this.error.set(null);
  }
}
