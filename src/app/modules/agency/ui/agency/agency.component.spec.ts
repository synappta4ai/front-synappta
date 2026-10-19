import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';
import { AiModel, GenerateRequest } from '@modules/agency/interfaces';
import { Piece } from '@modules/events/interfaces';

import { RequiredPhoto, ReferenceImage } from './agency-photos';
import { AgencyComponent } from './agency.component';

const base = environment.API_URL;

/** Señal escribible, vista desde el test (el componente no exporta sus tipos). */
interface AnySignal<T> {
  (): T;
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

interface TestAngle {
  id: string;
  title: string;
  description: string;
  selected: boolean;
}

interface TestScene {
  id: string;
  angleId: string;
  title: string;
  description: string;
  boardFileId?: string | null;
  references?: ReferenceImage[];
  refsApproved?: boolean;
  shots: unknown[];
  prompts?: { text: string }[];
}

/** Internals del componente que el test maneja directamente. */
interface Internals {
  agent: AnySignal<string>;
  angles: AnySignal<TestAngle[]>;
  storyboard: AnySignal<TestScene[]>;
  stepPhotos: AnySignal<RequiredPhoto[]>;
  stepPhotosSkipped: AnySignal<boolean>;
  currentPhase: AnySignal<string>;
  canAdvanceToPrompts: boolean;
  pendingStepPhotos(): RequiredPhoto[];
  stepPhotosCount(): number;
  phases(): { key: string }[];
  toggleAngle(id: string): void;
  generateStoryboard(): void;
  generatePrompts(): void;
  skipStepPhotos(): void;
  videoPayloadFor(
    scene: TestScene,
    shotId: string | null,
    index: number,
    model: AiModel,
    project: { id: string },
    piece: Piece,
  ): GenerateRequest | null;
}

function angle(id: string, title: string, selected = true): TestAngle {
  return { id, title, description: `${title}: descripción de la escena`, selected };
}

function photo(overrides: Partial<RequiredPhoto> & { file?: ReferenceImage }): RequiredPhoto {
  const { file, ...rest } = overrides;
  return {
    id: 'P1-0',
    promptId: 'P1',
    type: 'locacion',
    description: 'Foto de la cocina',
    reason: '',
    priority: 'imprescindible',
    files: file ? [file] : [],
    ...rest,
  };
}

const cocina: ReferenceImage = { id: 'f1', filename: 'cocina.jpg', url: null };
const envase: ReferenceImage = { id: 'f2', filename: 'envase.jpg', url: null };

describe('AgencyComponent — flujo comercial publicitario', () => {
  let fixture: { componentInstance: unknown; detectChanges: () => void };
  let http: HttpTestingController;
  let component: Internals;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgencyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AgencyComponent) as unknown as typeof fixture;
    http = TestBed.inject(HttpTestingController);
    component = fixture.componentInstance as unknown as Internals;

    // Carga inicial: proyectos, catálogo de modelos y credenciales del tenant.
    for (const req of http.match((request) => request.url.startsWith(base))) {
      if (req.request.url.includes('/events')) {
        req.flush({ success: true, message: 'ok', data: [] });
      } else if (req.request.url.includes('/models') || req.request.url.includes('/credentials')) {
        req.flush({ success: true, message: 'ok', data: [] });
      } else {
        req.flush({ success: true, message: 'ok', data: [] });
      }
    }
  });

  afterEach(() => {
    http.verify();
  });

  /**
   * Avanza el flujo como lo haría un click: `nextPhase` programa un
   * `afterNextRender` (foco del título) y eso exige un contexto de inyección.
   */
  function clickGenerateStoryboard(): void {
    TestBed.runInInjectionContext(() => component.generateStoryboard());
  }

  /** Brief completo: sin esto no se puede generar ni avanzar. */
  function fillBrief(): void {
    const form = (fixture.componentInstance as unknown as { form: { patchValue: (v: unknown) => void } })
      .form;
    form.patchValue({
      propertyName: 'Campaña otoño',
      location: 'CDMX',
      description: 'Brief con guion del spot',
    });
  }

  it('deja el flujo del comercial en tres pasos, sin Storyboard', () => {
    component.agent.set('commercial');
    expect(component.phases().map((p) => p.key)).toEqual(['input', 'angles', 'scenes']);

    // Los otros expertos siguen con los cuatro pasos.
    component.agent.set('real_estate');
    expect(component.phases().map((p) => p.key)).toEqual([
      'input',
      'angles',
      'storyboard',
      'scenes',
    ]);
  });

  it('no deja avanzar a los prompts hasta resolver las imágenes imprescindibles', () => {
    fillBrief();
    component.agent.set('commercial');
    component.angles.set([angle('P1', 'La cocina')]);
    component.stepPhotos.set([
      photo({ id: 'P1-0', priority: 'imprescindible' }),
      photo({ id: 'P1-1', type: 'producto', priority: 'recomendada' }),
    ]);

    expect(component.pendingStepPhotos().map((p) => p.id)).toEqual(['P1-0']);
    expect(component.canAdvanceToPrompts).toBe(false);

    // Con el archivo subido (o con la salida explícita) se habilita.
    component.stepPhotos.update((photos) =>
      photos.map((p) => (p.id === 'P1-0' ? { ...p, files: [cocina] } : p)),
    );
    expect(component.canAdvanceToPrompts).toBe(true);
    expect(component.stepPhotosCount()).toBe(1);
  });

  it('la salida explícita destraba el avance aunque falten imprescindibles', () => {
    fillBrief();
    component.agent.set('commercial');
    component.angles.set([angle('P1', 'La cocina')]);
    component.stepPhotos.set([photo({ id: 'P1-0' })]);

    expect(component.canAdvanceToPrompts).toBe(false);
    component.skipStepPhotos();
    expect(component.canAdvanceToPrompts).toBe(true);
  });

  it('arma una escena por prompt (sin hoja) con las imágenes del paso 1 como referencias', () => {
    component.agent.set('commercial');
    component.stepPhotos.set([
      photo({ id: 'P1-0', files: [cocina] }),
      photo({
        id: 'P1-1',
        type: 'producto',
        description: 'Envase de frente',
        priority: 'recomendada',
        files: [envase],
      }),
    ]);
    component.angles.set([angle('P1', 'La cocina'), angle('P2', 'La calle', false)]);
    // El botón "Siguiente" de los prompts se aprieta desde el paso 2.
    component.currentPhase.set('angles');

    clickGenerateStoryboard();

    const scenes = component.storyboard();
    expect(scenes.length).toBe(1);
    expect(scenes[0].title).toBe('La cocina');
    expect(scenes[0].references?.map((r) => [r.id, r.role])).toEqual([
      ['f1', 'locacion'],
      ['f2', 'producto'],
    ]);
    expect(scenes[0].refsApproved).toBe(true);
    expect(scenes[0].boardFileId ?? null).toBeNull();
    // Sin hoja de storyboard el paso siguiente del comercial son las escenas.
    expect(component.currentPhase()).toBe('scenes');
  });

  it('el prompt del video sale con las imágenes tagueadas y sin mención al storyboard', () => {
    component.agent.set('commercial');
    component.stepPhotos.set([
      photo({ id: 'P1-0', files: [cocina] }),
      photo({
        id: 'P1-1',
        type: 'producto',
        description: 'Envase de frente',
        priority: 'recomendada',
        files: [envase],
      }),
    ]);
    component.angles.set([angle('P1', 'La cocina')]);
    component.currentPhase.set('angles');
    clickGenerateStoryboard();
    component.generatePrompts();

    const text = component.storyboard()[0].prompts?.[0]?.text ?? '';
    expect(text).toContain('@image1 (locacion — Foto de la cocina)');
    expect(text).toContain('@image2 (producto — Envase de frente)');
    expect(text).not.toContain('hoja de storyboard');
  });

  it('adjunta las imágenes al modelo: todas con multi-referencia, la primera como ancla si no', () => {
    component.agent.set('commercial');
    component.stepPhotos.set([
      photo({ id: 'P1-0', files: [cocina] }),
      photo({ id: 'P1-1', type: 'producto', files: [envase] }),
    ]);
    component.angles.set([angle('P1', 'La cocina')]);
    component.currentPhase.set('angles');
    clickGenerateStoryboard();
    component.generatePrompts();

    const scene = component.storyboard()[0];
    const project = { id: 'project-1' };
    const piece = { id: 'piece-1' } as Piece;
    const single = { name: 'video-uno', modality: 'video', defaults: {} } as unknown as AiModel;
    const multi = {
      name: 'video-multi',
      modality: 'video',
      defaults: {},
      reference_endpoint: '/generate',
    } as unknown as AiModel;

    const imageIds = (payload: GenerateRequest | null): string[] =>
      (payload?.content ?? [])
        .filter((item) => item.type === 'image')
        .map((item) => String((item as { id?: string }).id ?? ''));

    expect(imageIds(component.videoPayloadFor(scene, null, 0, single, project, piece))).toEqual(['f1']);
    expect(imageIds(component.videoPayloadFor(scene, null, 0, multi, project, piece))).toEqual([
      'f1',
      'f2',
    ]);
  });

  it('el flujo inmobiliario sigue armando sus dos escenas plantilla por ángulo', () => {
    component.agent.set('real_estate');
    component.angles.set([angle('P10', 'Vista al parque')]);

    clickGenerateStoryboard();

    expect(component.storyboard().length).toBe(2);
    expect(component.storyboard()[0].title).toContain('Escena');
  });

  it('desmarca un prompt y no arma su escena', () => {
    component.agent.set('commercial');
    component.angles.set([angle('P1', 'La cocina'), angle('P2', 'La calle')]);

    component.toggleAngle('P2');
    clickGenerateStoryboard();

    expect(component.storyboard().map((s) => s.title)).toEqual(['La cocina']);
  });
});
