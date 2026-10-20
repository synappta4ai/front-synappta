import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { AdminApiRepository } from './admin-api.repository';
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
