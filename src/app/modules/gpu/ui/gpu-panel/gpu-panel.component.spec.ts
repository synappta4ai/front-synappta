import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';

import { environment } from '@env/environment';

import {
  GpuWorker,
  ManagedWorkerModel,
  ManagedWorkerModelDownload,
  ModelFit,
} from '../../interfaces/gpu.interface';
import { GpuPanelComponent } from './gpu-panel.component';

const base = environment.API_URL;

/**
 * Escenario real del panel en modo bridge: el worker central no responde, así
 * que el catálogo sale del snapshot de las GPUs emparejadas (header
 * X-Worker-Source: bridge) y las descargas se piden a la máquina que reportó
 * cada modelo. Los backs ya desplegados no mandan worker_id por modelo: el
 * panel lo resuelve desde /gpu/workers.
 */
const worker: GpuWorker = {
  id: 'w-1',
  name: 'PC-Casa',
  gpu_name: 'RTX 3060',
  os: 'win32',
  version: '0.2.5',
  vram_total_mb: 12288,
  vram_free_mb: 9000,
  jobs_active: 0,
  online: true,
  last_heartbeat: '2026-10-14T13:00:00Z',
  created_at: '2026-10-14T12:00:00Z',
  models: [
    {
      key: 'SD-1.5',
      label: 'SD 1.5',
      mode: 'image',
      engine: 'diffusers',
      pipeline: 'sd15',
      repo: 'stable-diffusion-v1-5/stable-diffusion-v1-5',
      steps: 20,
      vram_gb: 4,
      family: 'sd',
      available: false,
      notes: '',
      size_bytes: 9_014_119_167,
    },
    {
      key: 'SD-Tiny-Test',
      label: 'SD Tiny',
      mode: 'image',
      engine: 'diffusers',
      pipeline: 'sd15',
      repo: 'diffusers/tiny-stable-diffusion-torch',
      steps: 4,
      vram_gb: 2,
      family: 'sd',
      available: true,
      notes: '',
      size_bytes: 8_832_013,
    },
  ],
};

const bridgeModels: ManagedWorkerModel[] = [
  {
    name: 'SD-1.5',
    display_name: 'SD 1.5',
    modality: 'image',
    type: 'downloaded',
    downloaded: {
      mode: 'image',
      engine: 'diffusers',
      pipeline: 'sd15',
      repo: 'stable-diffusion-v1-5/stable-diffusion-v1-5',
      vram_gb: 4,
      available: false,
      downloading: false,
      download_percent: 0,
      size_bytes: 9_014_119_167,
    },
  },
  {
    name: 'SD-Tiny-Test',
    display_name: 'SD Tiny',
    modality: 'image',
    type: 'downloaded',
    downloaded: {
      mode: 'image',
      engine: 'diffusers',
      pipeline: 'sd15',
      repo: 'diffusers/tiny-stable-diffusion-torch',
      vram_gb: 2,
      available: true,
      downloading: false,
      download_percent: 100,
      size_bytes: 8_832_013,
    },
  },
];

interface PanelInternals {
  displayedModels: () => ManagedWorkerModel[];
  weightModels: () => ManagedWorkerModel[];
  weightlessCount: () => number;
  workerModels: { set: (value: ManagedWorkerModel[]) => void };
  bridgeDownload: (model: ManagedWorkerModel) => void;
  bridgeDelete: (model: ManagedWorkerModel) => void;
  canDelete: (model: ManagedWorkerModel) => boolean;
}

describe('GpuPanelComponent en modo bridge', () => {
  let fixture: ComponentFixture<GpuPanelComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpuPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        MessageService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GpuPanelComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function panel(): PanelInternals {
    return fixture.componentInstance as unknown as PanelInternals;
  }

  /** Carga el panel con el catálogo servido por el bridge (sin worker_id). */
  async function loadBridgeCatalog(): Promise<void> {
    fixture.detectChanges();
    http
      .expectOne(`${base}/gpu/workers`)
      .flush({ success: true, message: 'success', data: [worker] });
    http
      .expectOne(`${base}/worker/models`)
      .flush(
        { success: true, message: 'success', data: bridgeModels },
        { headers: { 'X-Worker-Source': 'bridge' } },
      );
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('resuelve la GPU que reportó cada modelo y ofrece descargar el que no tiene pesos', async () => {
    await loadBridgeCatalog();

    const models = panel().displayedModels();
    const missing = models.find((m) => m.name === 'SD-1.5');
    const ready = models.find((m) => m.name === 'SD-Tiny-Test');

    // Sin worker_id en la respuesta del back, la identidad sale de la GPU.
    expect(missing?.worker_id).toBe('w-1');
    expect(missing?.worker_name).toBe('PC-Casa');
    expect(ready?.worker_id).toBe('w-1');

    // En la tabla, un solo botón de acción: el del modelo sin pesos (el
    // disponible no lo lleva). La tarjeta de recomendados tiene el suyo.
    const table = (fixture.nativeElement as HTMLElement).querySelector('p-table') as HTMLElement;
    const buttons = Array.from(table.querySelectorAll('button')) as HTMLButtonElement[];
    const downloadButtons = buttons.filter((b) =>
      (b.textContent ?? '').includes('GPU.MODELS.DOWNLOAD'),
    );
    expect(downloadButtons.length).toBe(1);
  });

  it('sólo ofrece borrar cuando hay pesos en disco', () => {
    const panel = fixture.componentInstance as unknown as PanelInternals;
    const model = (downloaded?: Partial<ManagedWorkerModelDownload>): ManagedWorkerModel => ({
      name: 'SD-Tiny-Test',
      display_name: 'SD Tiny',
      modality: 'image',
      type: 'downloaded',
      downloaded: downloaded && {
        mode: 'image',
        engine: 'diffusers',
        pipeline: 'sd15',
        available: false,
        downloading: false,
        download_percent: 0,
        size_bytes: 0,
        ...downloaded,
      },
    });

    expect(panel.canDelete(model({ available: true, size_bytes: 8_832_013 }))).toBe(true);
    // Descarga a medias: no sirve para generar pero ocupa disco, se puede borrar.
    expect(panel.canDelete(model({ available: false, size_bytes: 1_506_881_321 }))).toBe(true);
    // Sin bytes en disco no hay nada que borrar.
    expect(panel.canDelete(model({ available: true, size_bytes: 0 }))).toBe(false);
    // Nunca descargado.
    expect(panel.canDelete(model({ available: false, size_bytes: 0 }))).toBe(false);
    // Con descarga en curso: primero se cancela.
    expect(
      panel.canDelete(model({ available: true, size_bytes: 8_832_013, downloading: true })),
    ).toBe(false);
    // Worker viejo sin estado de pesos.
    expect(panel.canDelete(model())).toBe(false);
  });

  it('pide el borrado de los pesos a la GPU emparejada', async () => {
    await loadBridgeCatalog();
    const model = panel().displayedModels().find((m) => m.name === 'SD-Tiny-Test')!;
    expect(panel().canDelete(model)).toBe(true);

    // El confirm acepta directo: lo que importa es a qué endpoint se pide.
    const confirmation = (
      fixture.componentInstance as unknown as {
        confirmationService: { confirm: (opts: { accept: () => void }) => void };
      }
    ).confirmationService;
    vi.spyOn(confirmation, 'confirm').mockImplementation((opts: { accept: () => void }) =>
      opts.accept(),
    );

    panel().bridgeDelete(model);

    const req = http.expectOne(`${base}/gpu/workers/w-1/models/SD-Tiny-Test`);
    expect(req.request.method).toBe('DELETE');
    req.flush({
      success: true,
      message: 'success',
      data: { worker_id: 'w-1', model_key: 'SD-Tiny-Test' },
    });

    // El notice dispara el refresco del panel (lista + catálogo).
    http
      .match(`${base}/gpu/workers`)
      .forEach((r) => r.flush({ success: true, message: 'success', data: [worker] }));
    http
      .match(`${base}/worker/models`)
      .forEach((r) =>
        r.flush(
          { success: true, message: 'success', data: bridgeModels },
          { headers: { 'X-Worker-Source': 'bridge' } },
        ),
      );
  });

  it('lista sólo modelos con pesos descargables: nada llega descargado de fábrica', () => {
    const weightless = (name: string, engine: string): ManagedWorkerModel => ({
      name,
      display_name: name,
      modality: 'image',
      type: 'downloaded',
      downloaded: {
        mode: 'image',
        engine,
        pipeline: 'demo',
        repo: engine === 'v1_bridge' ? 'org/demo' : undefined,
        available: true,
        downloading: false,
        download_percent: 100,
        size_bytes: 0,
      },
    });

    panel().workerModels.set([
      ...bridgeModels,
      weightless('Chatterbox-TTS', 'mock'),
      weightless('LTX-Video-2.5', 'v1_bridge'),
    ]);

    // Mock y bridge V1 no pesan en disco: no se pueden descargar ni borrar.
    expect(
      panel()
        .weightModels()
        .map((m) => m.name),
    ).toEqual(['SD-1.5', 'SD-Tiny-Test']);
    expect(panel().weightlessCount()).toBe(2);
    // Toda fila visible declara su repo de Hugging Face: se puede descargar.
    expect(
      panel()
        .weightModels()
        .every((m) => !!m.downloaded?.repo),
    ).toBe(true);
  });

  it('pide la descarga a la GPU emparejada por HTTP', async () => {
    await loadBridgeCatalog();

    const model = panel()
      .displayedModels()
      .find((m) => m.name === 'SD-1.5')!;
    panel().bridgeDownload(model);

    const req = http.expectOne(`${base}/gpu/workers/w-1/models/SD-1.5/download`);
    expect(req.request.method).toBe('POST');
    req.flush({
      success: true,
      message: 'created',
      data: { worker_id: 'w-1', model_key: 'SD-1.5' },
    });
    await fixture.whenStable();

    // El panel recarga el catálogo después de encolar la descarga.
    http
      .match(`${base}/gpu/workers`)
      .forEach((r) => r.flush({ success: true, message: 'success', data: [worker] }));
    http
      .match(`${base}/worker/models`)
      .forEach((r) =>
        r.flush(
          { success: true, message: 'success', data: bridgeModels },
          { headers: { 'X-Worker-Source': 'bridge' } },
        ),
      );
  });
});

interface HardwareInternals {
  workers: { set: (value: GpuWorker[]) => void };
  workerModels: { set: (value: ManagedWorkerModel[]) => void };
  targetGpu: () => GpuWorker | null;
  hardwareVramMb: () => number;
  modelFit: (model: ManagedWorkerModel) => ModelFit;
  hardwareSummary: () => {
    good: number;
    tight: number;
    insufficient: number;
    unknown: number;
    total: number;
  };
  recommendedModels: () => ManagedWorkerModel[];
  workerRequirements: () => {
    minGb: number;
    recommendedGb: number;
    maxGb: number;
    models: number;
  };
  diskFreeMb: () => number;
  lowDisk: () => boolean;
  diskFull: () => boolean;
  formatEta: (seconds: number) => string;
}

/** Un modelo del catálogo con la VRAM que pide y el estado de pesos pedido. */
const modelWith = (
  name: string,
  vramGb: number,
  extra: Partial<ManagedWorkerModelDownload> = {},
): ManagedWorkerModel => ({
  name,
  display_name: name,
  modality: 'image',
  type: 'downloaded',
  downloaded: {
    mode: 'image',
    engine: 'diffusers',
    pipeline: 'sd15',
    repo: 'org/demo',
    vram_gb: vramGb,
    available: false,
    downloading: false,
    download_percent: 0,
    size_bytes: 0,
    ...extra,
  },
});

const gpu = (id: string, vramMb: number, online: boolean): GpuWorker => ({
  ...worker,
  id,
  name: `PC-${id}`,
  gpu_name: `GPU ${id}`,
  vram_total_mb: vramMb,
  online,
  models: [],
});

/**
 * Compatibilidad con el hardware: el panel compara el `vram_gb` del catálogo
 * contra la VRAM que reporta la GPU emparejada, para no ofrecer modelos que no
 * entran y para recomendar los que sí.
 */
describe('GpuPanelComponent · hardware', () => {
  let fixture: ComponentFixture<GpuPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpuPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        MessageService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GpuPanelComponent);
  });

  function panel(): HardwareInternals {
    return fixture.componentInstance as unknown as HardwareInternals;
  }

  it('toma como referencia la GPU en línea con más VRAM', () => {
    panel().workers.set([
      gpu('grande-offline', 24576, false),
      gpu('chica', 6144, true),
      gpu('grande', 12288, true),
    ]);

    expect(panel().targetGpu()?.id).toBe('grande');
    expect(panel().hardwareVramMb()).toBe(12288);
  });

  it('sin GPUs emparejadas no inventa un veredicto', () => {
    panel().workers.set([]);

    expect(panel().targetGpu()).toBeNull();
    expect(panel().modelFit(modelWith('SD-1.5', 4))).toBe('unknown');
  });

  it('clasifica cada modelo según la VRAM de la GPU', () => {
    // 12 GB: 4 GB entra con margen (4 × 1,25 = 5), 10 GB entra justo
    // (10 × 1,25 = 12,5 > 12) y 16 GB no entra.
    panel().workers.set([gpu('w-1', 12288, true)]);

    expect(panel().modelFit(modelWith('liviano', 4))).toBe('good');
    expect(panel().modelFit(modelWith('grande', 10))).toBe('tight');
    expect(panel().modelFit(modelWith('enorme', 16))).toBe('insufficient');
    // Sin spec de VRAM en el catálogo: no hay nada que comparar.
    expect(panel().modelFit(modelWith('sin-dato', 0))).toBe('unknown');
  });

  it('resume cuántos modelos entran y cuáles recomendar', () => {
    panel().workers.set([gpu('w-1', 12288, true)]);
    panel().workerModels.set([
      modelWith('liviano', 4),
      modelWith('mediano', 10),
      modelWith('enorme', 16),
      modelWith('ya-descargado', 4, { available: true, download_percent: 100 }),
      modelWith('bajando', 6, { downloading: true }),
    ]);

    expect(panel().hardwareSummary()).toEqual({
      good: 3,
      tight: 1,
      insufficient: 1,
      unknown: 0,
      total: 5,
    });
    // Sólo los que entran y faltan descargar: primero los cómodos, y dentro
    // de cada grupo el más liviano (termina antes y sirve para probar).
    expect(
      panel()
        .recommendedModels()
        .map((m) => m.name),
    ).toEqual(['liviano', 'mediano']);
  });

  it('bloquea descargas cuando al worker le queda menos de 1 GB de disco', () => {
    panel().workers.set([{ ...gpu('w-1', 12288, true), disk_free_mb: 512 }]);

    expect(panel().diskFreeMb()).toBe(512);
    expect(panel().diskFull()).toBe(true);
    expect(panel().lowDisk()).toBe(true);
  });

  it('con poco disco avisa pero deja descargar si hay más de 1 GB', () => {
    panel().workers.set([{ ...gpu('w-1', 12288, true), disk_free_mb: 3 * 1024 }]);

    expect(panel().lowDisk()).toBe(true);
    expect(panel().diskFull()).toBe(false);
  });

  it('sin dato de disco no bloquea: los workers viejos no lo reportan', () => {
    panel().workers.set([gpu('w-1', 12288, true)]);

    expect(panel().diskFreeMb()).toBe(0);
    expect(panel().lowDisk()).toBe(false);
    expect(panel().diskFull()).toBe(false);
  });

  it('formatea la ETA de la descarga en s, min y h', () => {
    expect(panel().formatEta(45)).toBe('45 s');
    expect(panel().formatEta(600)).toBe('10 min');
    expect(panel().formatEta(3 * 3600 + 20 * 60)).toBe('3 h 20 min');
    // Sin dos muestras no hay estimación: no se muestra nada.
    expect(panel().formatEta(0)).toBe('');
  });

  it('deriva del catálogo los requisitos para instalar el worker', () => {
    panel().workerModels.set([
      modelWith('liviano', 4),
      modelWith('mediano', 10),
      modelWith('enorme', 16),
      // Los motores sin pesos no limitan la compra de hardware.
      { name: 'mock', display_name: 'Mock', modality: 'image', type: 'downloaded' },
    ]);

    expect(panel().workerRequirements()).toEqual({
      minGb: 4,
      recommendedGb: 5,
      maxGb: 16,
      models: 3,
    });
  });
});
