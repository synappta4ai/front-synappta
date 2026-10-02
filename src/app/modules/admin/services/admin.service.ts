import { inject, Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';

import {
  CreateTenantMemberRequest,
  CreateTenantRequest,
  GeneratedImagesPage,
  GeneratedVideosPage,
  PermissionDef,
  PlatformUser,
  ServerCommsPage,
  Tenant,
  TenantCredential,
  TenantMember,
  TenantModel,
  TenantUser,
  UpdateTenantPermissionsRequest,
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

  updateTenantPermissions(id: number, permissions: string[]): Observable<{ permissions: string[] }> {
    return unwrap(this.adminApiRepository.updateTenantPermissions(id, { permissions }));
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

  // ─── Per-tenant user management (platform superadmin) ───

  listTenantMembers(id: number): Observable<TenantMember[]> {
    return unwrap(this.adminApiRepository.listTenantMembers(id));
  }

  createTenantMember(id: number, payload: CreateTenantMemberRequest): Observable<TenantMember> {
    return unwrap(this.adminApiRepository.createTenantMember(id, payload));
  }

  updateTenantMemberRole(tenantId: number, userId: number, roleLevel: number): Observable<{ role_level: number; role_name: string }> {
    return unwrap(this.adminApiRepository.updateTenantMemberRole(tenantId, userId, roleLevel));
  }

  updateTenantMemberPermissions(tenantId: number, userId: number, permissions: string[]): Observable<{ permissions: string[] }> {
    return unwrap(this.adminApiRepository.updateTenantMemberPermissions(tenantId, userId, permissions));
  }

  removeTenantMember(tenantId: number, userId: number): Observable<null> {
    return unwrap(this.adminApiRepository.removeTenantMember(tenantId, userId));
  }

  listPlatformUsers(q?: string): Observable<PlatformUser[]> {
    return unwrap(this.adminApiRepository.listPlatformUsers(q));
  }

  listPermissionCatalog(): Observable<PermissionDef[]> {
    return unwrap(this.adminApiRepository.listPermissionCatalog());
  }

  listServerComms(page = 1, limit = 20, taskId?: string): Observable<ServerCommsPage> {
    return unwrap(this.adminApiRepository.listServerComms(page, limit, taskId));
  }

  listGeneratedVideos(page = 1, limit = 20, eventId?: string): Observable<GeneratedVideosPage> {
    return unwrap(this.adminApiRepository.listGeneratedVideos(page, limit, eventId));
  }

  listGeneratedImages(page = 1, limit = 20, eventId?: string): Observable<GeneratedImagesPage> {
    return unwrap(this.adminApiRepository.listGeneratedImages(page, limit, eventId));
  }
}

function unwrap<T>(source: Observable<ApiResponse<T>>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        // success:false es error real; success:true con data:null es una
        // respuesta de solo-mensaje (p.ej. "file added to ingredient").
        if (response.success === false) {
          subscriber.error(new Error(response.message || 'Request failed'));
          return;
        }
        if (response.data === null) {
          subscriber.next(null as T);
          subscriber.complete();
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
