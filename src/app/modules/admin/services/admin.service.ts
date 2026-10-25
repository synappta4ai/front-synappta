import { inject, Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';

import { MasterModelPref, MasterPrefsView } from '@modules/agency/interfaces';
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
  TenantStorageConfig,
  TenantStorageConfigRequest,
  TenantUser,
  UpdateTenantPermissionsRequest,
  UpsertTenantCredentialRequest,
  WorkerArtifact,
  WorkerModel,
  WorkerModelState,
  WorkerStatus,
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

  updateTenantPermissions(
    id: number,
    permissions: string[],
  ): Observable<{ permissions: string[] }> {
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

  // ─── Maestro del catálogo (platform superadmin, vale para todos) ───

  getMasterModelPrefs(): Observable<MasterPrefsView> {
    return unwrap(this.adminApiRepository.getMasterModelPrefs());
  }

  upsertMasterModelPrefs(prefs: MasterModelPref[]): Observable<MasterPrefsView> {
    return unwrap(this.adminApiRepository.upsertMasterModelPrefs(prefs));
  }

  /** Descarga el archivo de exportación de credenciales (secretos en claro). */
  exportTenantCredentials(id: number): Observable<HttpResponse<Blob>> {
    return this.adminApiRepository.exportTenantCredentials(id);
  }

  /** Importa credenciales desde el archivo de exportación. */
  importTenantCredentials(id: number, file: File): Observable<{ imported: number }> {
    return unwrap(this.adminApiRepository.importTenantCredentials(id, file));
  }

  // ─── Per-tenant object storage (platform superadmin) ───

  getTenantStorage(id: number): Observable<TenantStorageConfig> {
    return unwrap(this.adminApiRepository.getTenantStorage(id));
  }

  saveTenantStorage(
    id: number,
    payload: TenantStorageConfigRequest,
  ): Observable<TenantStorageConfig> {
    return unwrap(this.adminApiRepository.saveTenantStorage(id, payload));
  }

  deleteTenantStorage(id: number): Observable<null> {
    return unwrap(this.adminApiRepository.deleteTenantStorage(id));
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

  updateTenantMemberRole(
    tenantId: number,
    userId: number,
    roleLevel: number,
  ): Observable<{ role_level: number; role_name: string }> {
    return unwrap(this.adminApiRepository.updateTenantMemberRole(tenantId, userId, roleLevel));
  }

  updateTenantMemberPermissions(
    tenantId: number,
    userId: number,
    permissions: string[],
  ): Observable<{ permissions: string[] }> {
    return unwrap(
      this.adminApiRepository.updateTenantMemberPermissions(tenantId, userId, permissions),
    );
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

  listServerComms(
    page = 1,
    limit = 20,
    taskId?: string,
    tenantSlug?: string,
  ): Observable<ServerCommsPage> {
    return unwrap(this.adminApiRepository.listServerComms(page, limit, taskId, tenantSlug));
  }

  listGeneratedVideos(
    page = 1,
    limit = 20,
    eventId?: string,
    tenantSlug?: string,
  ): Observable<GeneratedVideosPage> {
    return unwrap(this.adminApiRepository.listGeneratedVideos(page, limit, eventId, tenantSlug));
  }

  listGeneratedImages(
    page = 1,
    limit = 20,
    eventId?: string,
    tenantSlug?: string,
  ): Observable<GeneratedImagesPage> {
    return unwrap(this.adminApiRepository.listGeneratedImages(page, limit, eventId, tenantSlug));
  }

  // ─── Inference worker: model weight management ────────────────────────

  workerStatus(): Observable<WorkerStatus> {
    return unwrap(this.adminApiRepository.workerStatus());
  }

  listWorkerModels(): Observable<WorkerModel[]> {
    return unwrap(this.adminApiRepository.listWorkerModels());
  }

  downloadWorkerModel(key: string, cancel = false): Observable<WorkerModelState> {
    return unwrap(this.adminApiRepository.downloadWorkerModel(key, cancel));
  }

  cancelWorkerModelDownload(key: string): Observable<WorkerModelState> {
    return unwrap(this.adminApiRepository.cancelWorkerModelDownload(key));
  }

  deleteWorkerModel(key: string): Observable<WorkerModelState> {
    return unwrap(this.adminApiRepository.deleteWorkerModel(key));
  }

  // ─── Inference worker: artifacts ──────────────────────────────────────

  listWorkerArtifacts(): Observable<WorkerArtifact[]> {
    return unwrap(this.adminApiRepository.listWorkerArtifacts());
  }

  deleteWorkerArtifact(name: string): Observable<{ deleted: string; ok: boolean }> {
    return unwrap(this.adminApiRepository.deleteWorkerArtifact(name));
  }
}
