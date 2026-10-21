import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { AdminApiRepository } from './admin-api.repository';
import { WorkerModel } from '../interfaces';
import { environment } from '@env/environment';

describe('AdminApiRepository · tenant storage', () => {
  let repository: AdminApiRepository;
  let httpMock: HttpTestingController;

  const base = environment.API_URL;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    repository = TestBed.inject(AdminApiRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('reads the tenant bucket configuration', () => {
    repository.getTenantStorage(7).subscribe((response) => {
      expect(response.data?.configured).toBe(true);
      expect(response.data?.bucket).toBe('acme-media');
    });

    const req = httpMock.expectOne(`${base}/tenants/7/storage`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      message: 'success',
      data: {
        configured: true,
        endpoint: 'https://minio.example.com',
        bucket: 'acme-media',
        region: 'us-east-1',
        enabled: true,
        access_key_id: 'AKIA••••3456',
        has_secret: true,
      },
    });
  });

  it('saves the bucket with the credentials payload', () => {
    const payload = {
      endpoint: 'https://minio.example.com',
      bucket: 'acme-media',
      region: 'us-east-1',
      access_key_id: 'AKIAEXAMPLE',
      secret_access_key: 'secret',
      public_base: 'https://cdn.example.com/acme',
      enabled: true,
    };

    repository.saveTenantStorage(7, payload).subscribe((response) => {
      expect(response.data?.configured).toBe(true);
    });

    const req = httpMock.expectOne(`${base}/tenants/7/storage`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({
      success: true,
      message: 'success',
      data: {
        configured: true,
        bucket: 'acme-media',
        enabled: true,
        access_key_id: 'AKIA••••3456',
        has_secret: true,
      },
    });
  });

  it('removes the tenant bucket', () => {
    repository.deleteTenantStorage(7).subscribe((response) => {
      expect(response.data).toBeNull();
    });

    const req = httpMock.expectOne(`${base}/tenants/7/storage`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, message: 'storage config removed', data: null });
  });
});

// La consola administra otro tenant que el del token: el slug elegido viaja
// como X-Tenant-Slug y el back le da prioridad para superadmin.
describe('AdminApiRepository · tenant override', () => {
  let repository: AdminApiRepository;
  let httpMock: HttpTestingController;

  const base = environment.API_URL;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    repository = TestBed.inject(AdminApiRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('scopes the generated galleries to the selected tenant', () => {
    repository.listGeneratedVideos(1, 12, undefined, 'acme').subscribe();
    repository.listGeneratedImages(2, 12, undefined, 'acme').subscribe();

    const videos = httpMock.expectOne((req) => req.url === `${base}/agency/videos`);
    expect(videos.request.headers.get('X-Tenant-Slug')).toBe('acme');
    videos.flush({ success: true, message: 'success', data: { logs: [], total: 0 } });

    const images = httpMock.expectOne((req) => req.url === `${base}/agency/images`);
    expect(images.request.headers.get('X-Tenant-Slug')).toBe('acme');
    images.flush({ success: true, message: 'success', data: { logs: [], total: 0 } });
  });

  it('scopes the server communication logs to the selected tenant', () => {
    repository.listServerComms(1, 20, 'task-1', 'acme').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${base}/agency/logs/server-communications`);
    expect(req.request.headers.get('X-Tenant-Slug')).toBe('acme');
    expect(req.request.params.get('task_id')).toBe('task-1');
    req.flush({ success: true, message: 'success', data: { logs: [], total: 0 } });
  });

  it('omits the override when no tenant is selected', () => {
    repository.listGeneratedVideos().subscribe();

    const req = httpMock.expectOne((r) => r.url === `${base}/agency/videos`);
    expect(req.request.headers.has('X-Tenant-Slug')).toBe(false);
    req.flush({ success: true, message: 'success', data: { logs: [], total: 0 } });
  });
});

// El back sirve el catálogo del worker con la forma de /models (name +
// downloaded anidado); la tabla admin consume el modelo plano del worker.
describe('AdminApiRepository · worker models', () => {
  let repository: AdminApiRepository;
  let httpMock: HttpTestingController;

  const base = environment.API_URL;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    repository = TestBed.inject(AdminApiRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('flattens the worker catalog and keeps the weights path', () => {
    let models: WorkerModel[] = [];
    repository.listWorkerModels().subscribe((res) => (models = res.data ?? []));

    const req = httpMock.expectOne(`${base}/worker/models`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      message: 'success',
      data: [
        {
          name: 'SD-1.5',
          display_name: 'SD 1.5',
          modality: 'image',
          type: 'downloaded',
          downloaded: {
            mode: 'image',
            engine: 'diffusers',
            pipeline: 'sd15',
            repo: 'org/sd15',
            steps: 20,
            vram_gb: 4,
            family: 'sd',
            available: true,
            downloaded: true,
            downloading: false,
            download_percent: 100,
            size_bytes: 6900000000,
            download_path: '/home/u/.cache/huggingface/hub/models--org--sd15',
          },
        },
      ],
    });

    expect(models.length).toBe(1);
    expect(models[0].key).toBe('SD-1.5');
    expect(models[0].label).toBe('SD 1.5');
    expect(models[0].downloaded).toBe(true);
    expect(models[0].download_path).toContain('models--org--sd15');
  });

  it('leaves a model without weights downloadable', () => {
    let models: WorkerModel[] = [];
    repository.listWorkerModels().subscribe((res) => (models = res.data ?? []));

    const req = httpMock.expectOne(`${base}/worker/models`);
    req.flush({
      success: true,
      message: 'success',
      data: [
        {
          name: 'FLUX.1-dev',
          display_name: 'FLUX.1 dev',
          downloaded: {
            mode: 'image',
            engine: 'diffusers',
            available: false,
            downloaded: false,
            downloading: false,
            download_percent: 0,
            size_bytes: 0,
          },
        },
      ],
    });

    expect(models[0].downloaded).toBe(false);
    expect(models[0].download_path).toBeNull();
    expect(models[0].steps).toBe(0);
  });
});
