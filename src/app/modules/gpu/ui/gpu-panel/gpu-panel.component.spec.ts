import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';

import { GpuWorker, ManagedWorkerModel } from '../../interfaces/gpu.interface';
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
      available: true,
      downloading: false,
      download_percent: 100,
      size_bytes: 8_832_013,
    },
  },
];

interface PanelInternals {
  displayedModels: () => ManagedWorkerModel[];
  bridgeDownload: (model: ManagedWorkerModel) => void;
}

describe('GpuPanelComponent en modo bridge', () => {
  let fixture: ComponentFixture<GpuPanelComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpuPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
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

    // Un solo botón de acción: el del modelo sin pesos (el disponible no lo lleva).
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const downloadButtons = buttons.filter((b) =>
      (b.textContent ?? '').includes('GPU.MODELS.DOWNLOAD'),
    );
    expect(downloadButtons.length).toBe(1);
  });

  it('pide la descarga a la GPU emparejada por HTTP', async () => {
    await loadBridgeCatalog();

    const model = panel().displayedModels().find((m) => m.name === 'SD-1.5')!;
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
