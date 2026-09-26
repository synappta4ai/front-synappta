import { inject, Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  CreateTenantRequest,
  GeneratedVideosPage,
  ServerCommsPage,
  Tenant,
  TenantCredential,
  TenantModel,
  TenantUser,
  UpsertTenantCredentialRequest,
} from '../interfaces';
import { AdminApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly adminApiRepository = inject(AdminApiRepository);

  listTenants(): Observable<Tenant[]> {
    return unwrap(this.adminApiRepository.listTenants());
  }

  createTenant(payload: CreateTenantRequest): Observable<Tenant> {
    return unwrap(this.adminApiRepository.createTenant(payload));
  }

  deactivateTenant(id: number): Observable<null> {
    return unwrap(this.adminApiRepository.deactivateTenant(id));
  }

  // ─── Per-tenant models & credentials (platform superadmin) ───

  listTenantModels(id: number): Observable<TenantModel[]> {
    return unwrap(this.adminApiRepository.listTenantModels(id));
  }

  listTenantCredentials(id: number): Observable<TenantCredential[]> {
    return unwrap(this.adminApiRepository.listTenantCredentials(id));
  }

  upsertTenantCredential(
    id: number,
    payload: UpsertTenantCredentialRequest,
  ): Observable<TenantCredential> {
    return unwrap(this.adminApiRepository.upsertTenantCredential(id, payload));
  }

  deleteTenantCredential(id: number, provider: string): Observable<null> {
    return unwrap(this.adminApiRepository.deleteTenantCredential(id, provider));
  }

  /** Descarga el archivo de exportación de credenciales (secretos en claro). */
  exportTenantCredentials(id: number): Observable<HttpResponse<Blob>> {
    return this.adminApiRepository.exportTenantCredentials(id);
  }

  /** Importa credenciales desde el archivo de exportación. */
  importTenantCredentials(id: number, file: File): Observable<{ imported: number }> {
    return unwrap(this.adminApiRepository.importTenantCredentials(id, file));
  }

  listTenantUsers(id: number): Observable<TenantUser[]> {
    return unwrap(this.adminApiRepository.listTenantUsers(id));
  }

  listServerComms(page = 1, limit = 20, taskId?: string): Observable<ServerCommsPage> {
    return unwrap(this.adminApiRepository.listServerComms(page, limit, taskId));
  }

  listGeneratedVideos(page = 1, limit = 20): Observable<GeneratedVideosPage> {
    return unwrap(this.adminApiRepository.listGeneratedVideos(page, limit));
  }
}

function unwrap<T>(source: Observable<{ data: T | null; message: string }>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        if (response.data === null) {
          subscriber.error(new Error(response.message || 'Unexpected empty response'));
          return;
        }
        subscriber.next(response.data);
        subscriber.complete();
      },
      error: (err: unknown) => subscriber.error(err),
    });
    return () => subscription.unsubscribe();
  });
}
