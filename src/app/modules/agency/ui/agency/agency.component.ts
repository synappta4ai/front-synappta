import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { catchError, EMPTY, finalize, map, mergeMap, of, throwError } from 'rxjs';
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

import { AgencyService } from '../../services/agency.service';
import { AiModel, Credential, Modality, GeneratedAsset, StatusResponse } from '../../interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project, Piece } from '@modules/events/interfaces';
import { PageContainerComponent, ValidatorErrors } from '@shared/components/index';
import { TiltDirective } from '@shared/components/tilt/tilt.directive';
import { UserSessionStore } from '@core/store/user.session';
import { environment } from '@env/environment';

type WorkflowPhase = 'input' | 'angles' | 'storyboard' | 'scenes';

interface SalesAngle {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

interface StoryboardScene {
  id: string;
  title: string;
  description: string;
  shots: StoryboardShot[];
  /** Video generado de la escena (queda en el avance guardado). */
  videoUrl?: string | null;
  generatingVideo?: boolean;
}

interface StoryboardShot {
  id: string;
  description: string;
  imageUrl: string | null;
  generating: boolean;
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
    TiltDirective,
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
  ],
  templateUrl: './agency.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly eventsService = inject(EventsService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly session = inject(UserSessionStore);

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
  /** Modelo elegido por paso: '' = automático (default del back). */
  protected readonly modelText = signal('');
  protected readonly modelImage = signal('');
  protected readonly modelVideo = signal('');
  protected readonly modelTextOptions = computed(() => this.modelOptionsFor('text'));
  protected readonly modelImageOptions = computed(() => this.modelOptionsFor('image'));
  protected readonly modelVideoOptions = computed(() => this.modelOptionsFor('video'));
  protected readonly projectDescription = signal('');
  protected readonly selectedAngles = signal<readonly string[]>([]);
  protected readonly angles = signal<SalesAngle[]>(buildAngles(3));

  protected readonly storyboard = signal<StoryboardScene[]>([]);

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
      this.restoreWorkflow(project);
    });
  }

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

  protected goToPhase(phase: WorkflowPhase): void {
    this.currentPhase.set(phase);
  }

  protected nextPhase(): void {
    const phases: WorkflowPhase[] = ['input', 'angles', 'storyboard', 'scenes'];
    const currentIndex = phases.indexOf(this.currentPhase());
    if (currentIndex < phases.length - 1) {
      this.currentPhase.set(phases[currentIndex + 1]);
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
    this.selectedAngles.set(
      this.angles()
        .filter((a) => a.selected)
        .map((a) => a.id),
    );
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
    this.selectedAngles.set([]);

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
        title: `Escena ${i + 1}: ${angle.title}`,
        description: `Plano general del proyecto destacando ${angle.description.toLowerCase()}`,
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
        title: `Escena ${i + 2}: Detalle`,
        description: `Primer plano de acabados y acabados premium del ${angle.title}`,
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

  protected generateScene(sceneId: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              shots: s.shots.map((shot) => ({ ...shot, generating: true })),
            }
          : s,
      ),
    );

    const imageModels = this.models().filter((m) => m.modality === 'image');
    const model = imageModels.find((m) => m.name === this.modelImage()) ?? imageModels[0];
    if (!model) {
      this.error.set('No hay modelos de imagen disponibles.');
      return;
    }

    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return;

    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto de la Agencia.');
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        this.agencyService
          .generate('image', {
            model: model.name,
            content: [{ type: 'text', text: scene.description }],
            event_id: project.id,
            piece_id: piece.id,
            piece_code: piece.piece_code ?? `SCENE-${sceneId.toUpperCase()}`,
            generation_number: 1,
          })
          .pipe(
            catchError(() => {
              this.error.set(`Error al generar la escena ${sceneId}.`);
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.agencyService
              .pollTaskUntilDone('image', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(`Error al consultar estado de la escena ${sceneId}.`);
                  return EMPTY;
                }),
              )
              .subscribe((status: StatusResponse) => {
                if (status.status === 'succeeded' && status.outputs?.[0]?.url) {
                  const url = status.outputs[0].url;
                  this.storyboard.update((scenes) =>
                    scenes.map((s) =>
                      s.id === sceneId
                        ? {
                            ...s,
                            shots: s.shots.map((shot, idx) => ({
                              ...shot,
                              imageUrl: idx === 0 ? url : shot.imageUrl,
                              generating: false,
                            })),
                          }
                        : s,
                    ),
                  );
                } else {
                  this.storyboard.update((scenes) =>
                    scenes.map((s) =>
                      s.id === sceneId
                        ? {
                            ...s,
                            shots: s.shots.map((shot) => ({ ...shot, generating: false })),
                          }
                        : s,
                    ),
                  );
                }
                // La imagen generada queda guardada en el avance del proyecto.
                this.persistWorkflow();
              });
          });
      });
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

  /** Guarda fase, modelos, ángulos y storyboard en el proyecto elegido. */
  private persistWorkflow(): void {
    const id = this.selectedProjectId();
    if (!id) return;
    const state = {
      phase: this.currentPhase(),
      anglesCount: Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3,
      models: { text: this.modelText(), image: this.modelImage(), video: this.modelVideo() },
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
    this.eventsService
      .updateEvent(id, { metadata })
      .pipe(catchError(() => EMPTY))
      .subscribe((updated) => {
        this.projects.update((list) =>
          list.map((p) =>
            p.id === updated.id ? { ...p, metadata: updated.metadata ?? metadata } : p,
          ),
        );
      });
  }

  /** Recupera el avance guardado del proyecto elegido: fase, modelos por paso,
   *  ángulos (con sus ajustes) y storyboard (imágenes/videos ya generados). */
  private restoreWorkflow(project: Project | null): void {
    if (!project) {
      this.currentPhase.set('input');
      const count =
        Number((this.form.getRawValue() as { anglesCount?: number }).anglesCount) || 3;
      this.angles.set(buildAngles(count));
      this.selectedAngles.set([]);
      this.storyboard.set([]);
      this.modelText.set('');
      this.modelImage.set('');
      this.modelVideo.set('');
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
        this.selectedAngles.set(this.angles().filter((a) => a.selected).map((a) => a.id));
      }
    }
    if (Array.isArray(agency['storyboard'])) {
      const scenes = agency['storyboard'] as Partial<StoryboardScene>[];
      this.storyboard.set(
        scenes.map((sc, i) => ({
          id: sc.id ?? `scene-${i}`,
          title: sc.title ?? '',
          description: sc.description ?? '',
          videoUrl: sc.videoUrl ?? null,
          generatingVideo: false,
          shots: (sc.shots ?? []).map((sh) => ({ ...sh, generating: false })),
        })),
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

  protected updateSceneDescription(sceneId: string, value: string): void {
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, description: value } : s)),
    );
  }

  protected commitSceneEdit(): void {
    this.persistWorkflow();
  }

  /** Video de una escena con el modelo elegido en el paso Storyboard. */
  protected generateVideo(sceneId: string): void {
    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene || scene.generatingVideo) return;
    const videoModels = this.models().filter((m) => m.modality === 'video');
    const model = videoModels.find((m) => m.name === this.modelVideo()) ?? videoModels[0];
    if (!model) {
      this.error.set('No hay modelos de video disponibles.');
      return;
    }
    const resetFlag = () =>
      this.storyboard.update((scenes) =>
        scenes.map((s) => (s.id === sceneId ? { ...s, generatingVideo: false } : s)),
      );
    this.storyboard.update((scenes) =>
      scenes.map((s) => (s.id === sceneId ? { ...s, generatingVideo: true } : s)),
    );

    this.ensureSceneAnchor(scene)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto de la Agencia.');
          resetFlag();
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        this.agencyService
          .generate('video', {
            model: model.name,
            content: [{ type: 'text', text: scene.description }],
            ...(model.defaults.ratios?.[0] ? { ratio: model.defaults.ratios[0] } : {}),
            ...(model.defaults.durations?.[0] ? { duration: model.defaults.durations[0] } : {}),
            event_id: project.id,
            piece_id: piece.id,
            piece_code: piece.piece_code ?? `SCENE-${sceneId.toUpperCase()}`,
            generation_number: 1,
          })
          .pipe(
            catchError(() => {
              this.error.set(`Error al generar el video de ${sceneId}.`);
              resetFlag();
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.agencyService
              .pollTaskUntilDone('video', response.taskId)
              .pipe(
                catchError(() => {
                  this.error.set(`Error al consultar el video ${sceneId}.`);
                  resetFlag();
                  return EMPTY;
                }),
              )
              .subscribe((status: StatusResponse) => {
                this.storyboard.update((scenes) =>
                  scenes.map((s) =>
                    s.id === sceneId
                      ? {
                          ...s,
                          generatingVideo: false,
                          videoUrl:
                            status.status === 'succeeded' && status.outputs?.[0]?.url
                              ? status.outputs[0].url
                              : s.videoUrl ?? null,
                        }
                      : s,
                  ),
                );
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
    this.selectedAngles.set([]);
    this.angles.update((angles) => angles.map((a) => ({ ...a, selected: false })));
    this.storyboard.set([]);
    this.error.set(null);
  }
}
