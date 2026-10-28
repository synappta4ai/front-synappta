import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';

import { Tenant, TenantStorageConfig } from '../../interfaces';
import { TenantStorageDialogComponent } from './tenant-storage-dialog.component';

const base = environment.API_URL;
const url = `${base}/tenants/7/storage`;

const tenant: Tenant = {
  id: 7,
  slug: 'acme',
  name: 'Acme',
  active: true,
  permissions: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const localOnly: TenantStorageConfig = { configured: false, enabled: false, has_secret: false };

/** Vista de test del componente (sus miembros son protected). */
type DialogInternals = {
  onShow(): void;
  save(): void;
  askRemove(): void;
  remove(): void;
  form: {
    patchValue(value: Record<string, unknown>): void;
    getRawValue(): Record<string, unknown>;
  };
};

const done = { success: true, message: 'ok', data: null };

describe('TenantStorageDialogComponent', () => {
  let fixture: ComponentFixture<TenantStorageDialogComponent>;
  let httpMock: HttpTestingController;
  let cmp: DialogInternals;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TenantStorageDialogComponent],
      providers: [
        provideAnimationsAsync(),
        provideTranslateService(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TenantStorageDialogComponent);
    cmp = fixture.componentInstance as unknown as DialogInternals;
    // Sin tenant no se abre el diálogo: así el único GET es el del test.
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Abre el diálogo como lo haría el usuario y devuelve la config cargada. */
  function open(config: TenantStorageConfig): void {
    fixture.componentRef.setInput('tenant', tenant);
    cmp.onShow();
    httpMock.expectOne(url).flush({ ...done, data: config });
  }

  it('loads the current configuration into the form', () => {
    open({
      configured: true,
      endpoint: 'https://minio.example.com',
      bucket: 'acme-media',
      region: 'us-east-1',
      enabled: true,
      access_key_id: 'AKIA••••3456',
      has_secret: true,
    });

    const raw = cmp.form.getRawValue();
    expect(raw['endpoint']).toBe('https://minio.example.com');
    expect(raw['bucket']).toBe('acme-media');
    // Las credenciales nunca se precargan.
    expect(raw['accessKeyId']).toBe('');
    expect(raw['secretAccessKey']).toBe('');
  });

  it('does not save without credentials on a tenant with no bucket', () => {
    open(localOnly);
    cmp.form.patchValue({ endpoint: 'https://minio.example.com', bucket: 'acme-media' });
    cmp.save();

    // Sin access key/secret el back rechazaría el guardado: ni se intenta.
    httpMock.expectNone(url);
  });

  it('saves the bucket and clears the secret fields', () => {
    open(localOnly);
    cmp.form.patchValue({
      endpoint: 'https://minio.example.com',
      bucket: 'acme-media',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      enabled: true,
    });
    cmp.save();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({
      endpoint: 'https://minio.example.com',
      bucket: 'acme-media',
      access_key_id: 'AKIAEXAMPLE',
      secret_access_key: 'secret',
      enabled: true,
    });
    req.flush({
      ...done,
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

    const raw = cmp.form.getRawValue();
    expect(raw['accessKeyId']).toBe('');
    expect(raw['secretAccessKey']).toBe('');
  });

  it('removes the bucket after the inline confirmation', () => {
    open({
      configured: true,
      bucket: 'acme-media',
      enabled: true,
      access_key_id: 'AKIA••••3456',
      has_secret: true,
    });

    cmp.askRemove();
    cmp.remove();

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ...done, message: 'storage config removed' });
  });
});
