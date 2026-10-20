import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';
import { AiModel, GenerateRequest } from '@modules/agency/interfaces';
import { Piece } from '@modules/events/interfaces';

import { ProjectPhoto, RequiredPhoto, ReferenceImage } from './agency-photos';
import { ScenePromptArtifact } from './agency-scene-prompt';
import { PromptSegment } from './agency-prompt-highlight';
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
  prompts?: { text: string; videoModel?: string | null; ratio?: string | null }[];
}

/** Internals del componente que el test maneja directamente. */
interface Internals {
  agent: AnySignal<string>;
  angles: AnySignal<TestAngle[]>;
  storyboard: AnySignal<TestScene[]>;
  stepPhotos: AnySignal<RequiredPhoto[]>;
  projectPhotos: AnySignal<ProjectPhoto[]>;
  models: AnySignal<AiModel[]>;
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
  sceneFieldText(slot: {
    kind: 'location' | 'character' | 'product';
    description: string;
  }): string;
  promptResources(
    scene: TestScene,
    prompt: { text: string },
  ): { id: string; name: string; url: string | null; kind: string | null }[];
  highlightSegments(artifact: ScenePromptArtifact | null, text: string): PromptSegment[];
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

  it('adjunta solo las fotos tagueadas por nombre y respeta modelo/ratio de la caja', () => {
    component.agent.set('commercial');
    component.projectPhotos.set([
      { id: 'f1', filename: 'Ivan.jpg', url: null, tag: '@ivan', kind: 'character' },
      { id: 'f2', filename: 'Tienda.jpg', url: null, tag: '@tienda', kind: 'location' },
    ]);
    component.angles.set([angle('P1', 'La cocina')]);
    component.currentPhase.set('angles');
    clickGenerateStoryboard();
    component.generatePrompts();

    component.storyboard.update((scenes) =>
      scenes.map((scene) => ({
        ...scene,
        prompts: (scene.prompts ?? []).map((prompt) => ({
          ...prompt,
          text: 'La escena usa @ivan',
          videoModel: 'video-multi',
          ratio: '9:16',
        })),
      })),
    );

    const scene = component.storyboard()[0];
    const project = { id: 'project-1' };
    const piece = { id: 'piece-1' } as Piece;
    const fallback = {
      name: 'video-uno',
      modality: 'video',
      defaults: {},
    } as unknown as AiModel;
    const own = {
      name: 'video-multi',
      modality: 'video',
      defaults: { ratios: ['9:16', '16:9'] },
      reference_endpoint: '/generate',
    } as unknown as AiModel;
    component.models.set([fallback, own]);

    const payload = component.videoPayloadFor(scene, null, 0, fallback, project, piece);
    const images = (payload?.content ?? [])
      .filter((item) => item.type === 'image')
      .map((item) => String((item as { id?: string }).id ?? ''));

    expect(payload?.model).toBe('video-multi');
    expect(payload?.ratio).toBe('9:16');
    expect(images).toEqual(['f1']);
  });

  it('muestra como recursos solo las fotos tagueadas en cada prompt', () => {
    component.agent.set('commercial');
    component.projectPhotos.set([
      { id: 'f1', filename: 'Ivan.jpg', url: null, tag: '@ivan', kind: 'character' },
      { id: 'f2', filename: 'Tienda.jpg', url: null, tag: '@tienda', kind: 'location' },
    ]);
    const scene: TestScene = {
      id: 'scene-1',
      angleId: 'P1',
      title: 'La cocina',
      description: '',
      shots: [],
      references: [
        { id: 'f1', filename: 'Ivan.jpg', url: 'ivan.png', note: '@ivan', kind: 'character' },
        { id: 'f2', filename: 'Tienda.jpg', url: 'tienda.png', note: '@tienda', kind: 'location' },
      ],
    };
    component.storyboard.set([scene]);

    expect(
      component.promptResources(scene, { text: 'La escena usa @ivan.' }).map((item) => item.id),
    ).toEqual(['f1']);
    expect(component.promptResources(scene, { text: 'La escena no usa fotos.' })).toEqual([]);
  });

  it('sin tags en el prompt no adjunta ninguna foto al video comercial', () => {
    component.agent.set('commercial');
    component.projectPhotos.set([
      { id: 'f1', filename: 'Ivan.jpg', url: null, tag: '@ivan', kind: 'character' },
    ]);
    component.angles.set([angle('P1', 'La cocina')]);
    component.currentPhase.set('angles');
    clickGenerateStoryboard();
    component.generatePrompts();

    component.storyboard.update((scenes) =>
      scenes.map((scene) => ({
        ...scene,
        prompts: (scene.prompts ?? []).map((prompt) => ({ ...prompt, text: 'Sin referencias.' })),
      })),
    );

    const scene = component.storyboard()[0];
    const payload = component.videoPayloadFor(
      scene,
      null,
      0,
      { name: 'video-multi', modality: 'video', defaults: {}, reference_endpoint: '/generate' } as unknown as AiModel,
      { id: 'project-1' },
      { id: 'piece-1' } as Piece,
    );
    const images = (payload?.content ?? []).filter((item) => item.type === 'image');

    expect(images).toEqual([]);
  });

  it('colorea el prompt por tipo de recurso y detecta tags desconocidos', () => {
    component.projectPhotos.set([
      { id: 'f1', filename: 'Ivan.jpg', url: null, tag: '@ivan', kind: 'character' },
      { id: 'f2', filename: 'Tienda.jpg', url: null, tag: '@tienda', kind: 'location' },
    ]);
    const artifact: ScenePromptArtifact = {
      locacion: '@tienda',
      personajes: ['@ivan'],
      producto_en_escena: 'ninguno',
    };

    expect(component.highlightSegments(artifact, 'La @tienda recibe a @ivan.')).toEqual([
      { text: 'La ', tone: 'plain' },
      { text: '@tienda', tone: 'location' },
      { text: ' recibe a ', tone: 'plain' },
      { text: '@ivan', tone: 'character' },
      { text: '.', tone: 'plain' },
    ]);
    expect(component.highlightSegments(null, 'Entra @nadie.')[1]).toEqual({
      text: '@nadie',
      tone: 'unknown',
    });
  });

  it('deja el tag de una foto subida y envuelve solo los campos sin archivo', () => {
    component.projectPhotos.set([
      { id: 'f1', filename: 'Tienda.jpg', url: null, tag: '@tienda', kind: 'location' },
    ]);

    expect(component.sceneFieldText({ kind: 'location', description: '@tienda' })).toBe('@tienda');
    expect(
      component.sceneFieldText({ kind: 'location', description: '@tienda con luz cálida' }),
    ).toBe('@tienda con luz cálida');
    expect(component.sceneFieldText({ kind: 'location', description: '@abuelo' })).toContain(
      'P2_REF_SLOT',
    );
    expect(
      component.sceneFieldText({ kind: 'character', description: 'una madre joven' }),
    ).toContain('P2_REF_SLOT');
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
