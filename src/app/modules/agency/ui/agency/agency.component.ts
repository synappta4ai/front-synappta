import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { AgencyService } from '../../services/agency.service';
import { AiModel, Modality, GeneratedAsset, StatusResponse } from '../../interfaces';
import { PageContainerComponent } from '@shared/components/index';

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
}

interface StoryboardShot {
  id: string;
  description: string;
  imageUrl: string | null;
  generating: boolean;
}

@Component({
  selector: 'app-agency',
  imports: [ReactiveFormsModule, PageContainerComponent],
  templateUrl: './agency.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly currentPhase = signal<WorkflowPhase>('input');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly phases = [
    { key: 'input' as WorkflowPhase, name: 'Documentación' },
    { key: 'angles' as WorkflowPhase, name: 'Ángulos' },
    { key: 'storyboard' as WorkflowPhase, name: 'Storyboard' },
    { key: 'scenes' as WorkflowPhase, name: 'Escenas' },
  ];

  protected readonly phaseIndex = computed(() =>
    this.phases.findIndex((p) => p.key === this.currentPhase()),
  );

  protected readonly models = signal<readonly AiModel[]>([]);
  protected readonly selectedModel = signal<string>('');

  protected readonly projectDescription = signal('');
  protected readonly selectedAngles = signal<readonly string[]>([]);
  protected readonly angles = signal<SalesAngle[]>([
    {
      id: 'angle-1',
      title: 'Ángulo 1 — Exclusividad y lujo',
      description:
        'Resaltar los acabados premium, amenities exclusivos y la experiencia de habitar un espacio único.',
      selected: false,
    },
    {
      id: 'angle-2',
      title: 'Ángulo 2 — Inversión inteligente',
      description:
        'Enfocarse en la rentabilidad, plusvalía, ubicación estratégica y potencial de crecimiento.',
      selected: false,
    },
    {
      id: 'angle-3',
      title: 'Ángulo 3 — Estilo de vida',
      description:
        'Mostrar cómo es vivir ahí: entorno, comodidad, comunidad, cercanía a servicios.',
      selected: false,
    },
  ]);

  protected readonly storyboard = signal<StoryboardScene[]>([]);

  protected readonly form = this.formBuilder.group({
    propertyName: ['', Validators.required],
    location: ['', Validators.required],
    description: [''],
  });

  protected get canProceedToAngles(): boolean {
    return this.form.valid && this.projectDescription().length > 0;
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
    const { propertyName, location, description } = this.form.getRawValue();
    this.projectDescription.set(`${propertyName} en ${location}. ${description || ''}`.trim());

    this.loading.set(true);
    this.error.set(null);

    this.agencyService
      .listModels()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((models) => {
        this.models.set(models);
        this.nextPhase();
      });
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

    const imageModels = this.models().filter((m) => m.content_type === 'image');
    const model = imageModels[0];
    if (!model) {
      this.error.set('No hay modelos de imagen disponibles.');
      return;
    }

    const scene = this.storyboard().find((s) => s.id === sceneId);
    if (!scene) return;

    this.agencyService
      .generate('image', {
        model: model.name,
        content: [{ type: 'text', text: scene.description }],
        event_id: 'agency-workflow',
        piece_id: `scene-${sceneId}`,
        piece_code: `SCENE-${sceneId.toUpperCase()}`,
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
          });
      });
  }

  protected resetWorkflow(): void {
    this.currentPhase.set('input');
    this.form.reset();
    this.projectDescription.set('');
    this.selectedAngles.set([]);
    this.angles.update((angles) => angles.map((a) => ({ ...a, selected: false })));
    this.storyboard.set([]);
    this.error.set(null);
    this.models.set([]);
    this.selectedModel.set('');
  }
}
