import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import { MasterModelPref, MasterPrefsView } from '@modules/agency/interfaces';
import { FileAsset } from '@modules/library/interfaces';
import {
  CreateTenantMemberRequest,
  CreateTenantRequest,
  GeneratedImagesPage,
  GeneratedVideosPage,
  NotificationChannel,
  NotificationChannelRequest,
  PermissionDef,
  PlatformUser,
  ServerCommunicationLog,
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

/**
 * Entry of the worker catalog as the back serves it: the same nested shape as
 * `/models` (`name` + `downloaded`), because the worker's gRPC ModelInfo is
 * mapped once, in the back. The admin table works with the worker's own flat
 * shape, so the repository flattens it on the way in.
 */
interface WorkerModelWire {
  name: string;
  display_name?: string | null;
  modality?: string | null;
  downloaded?: {
    mode?: string;
    engine?: string;
    pipeline?: string;
    repo?: string | null;
    steps?: number;
    vram_gb?: number;
    family?: string | null;
    available?: boolean;
    downloaded?: boolean;
    downloading?: boolean;
    download_percent?: number;
    size_bytes?: number;
    download_error?: string | null;
    download_path?: string | null;
    notes?: string | null;
  } | null;
}

function toWorkerModel(m: WorkerModelWire): WorkerModel {
  const d = m.downloaded ?? {};
  return {
    key: m.name,
    label: m.display_name ?? m.name,
    mode: (d.mode ?? '') as WorkerModel['mode'],
    engine: (d.engine ?? '') as WorkerModel['engine'],
    pipeline: d.pipeline ?? '',
    repo: d.repo ?? null,
    steps: d.steps ?? 0,
    vram_gb: d.vram_gb ?? 0,
    family: d.family ?? '',
    available: d.available ?? false,
    downloaded: d.downloaded ?? false,
    downloading: d.downloading ?? false,
    download_percent: d.download_percent ?? 0,
    size_bytes: d.size_bytes ?? 0,
    download_error: d.download_error ?? null,
    download_path: d.download_path ?? null,
    notes: d.notes ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class AdminApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  listTenants(): Observable<ApiResponse<Tenant[]>> {
    return this.http.get<ApiResponse<Tenant[]>>(`${this.apiUrl}/tenants`);
  }

  createTenant(payload: CreateTenantRequest): Observable<ApiResponse<Tenant>> {
    return this.http.post<ApiResponse<Tenant>>(`${this.apiUrl}/tenants`, payload);
  }

  deactivateTenant(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.apiUrl}/tenants/${id}/deactivate`, {});
  }

  updateTenantPermissions(
    id: number,
    payload: UpdateTenantPermissionsRequest,
  ): Observable<ApiResponse<{ permissions: string[] }>> {
    return this.http.put<ApiResponse<{ permissions: string[] }>>(
      `${this.apiUrl}/tenants/${id}/permissions`,
      payload,
    );
  }

  // ─── Per-tenant models & credentials (platform superadmin) ───

  listTenantModels(id: number): Observable<ApiResponse<TenantModel[]>> {
    return this.http.get<ApiResponse<TenantModel[]>>(`${this.apiUrl}/tenants/${id}/models`);
  }

  // ─── Maestro del catálogo (platform superadmin) ───

  getMasterModelPrefs(): Observable<ApiResponse<MasterPrefsView>> {
    return this.http.get<ApiResponse<MasterPrefsView>>(`${this.apiUrl}/models/master`);
  }

  upsertMasterModelPrefs(prefs: MasterModelPref[]): Observable<ApiResponse<MasterPrefsView>> {
    return this.http.put<ApiResponse<MasterPrefsView>>(`${this.apiUrl}/models/master`, prefs);
  }

  listTenantCredentials(id: number): Observable<ApiResponse<TenantCredential[]>> {
    return this.http.get<ApiResponse<TenantCredential[]>>(
      `${this.apiUrl}/tenants/${id}/credentials`,
    );
  }

  upsertTenantCredential(
    id: number,
    payload: UpsertTenantCredentialRequest,
  ): Observable<ApiResponse<TenantCredential>> {
    return this.http.put<ApiResponse<TenantCredential>>(
      `${this.apiUrl}/tenants/${id}/credentials`,
      payload,
    );
  }

  deleteTenantCredential(id: number, provider: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/tenants/${id}/credentials/${provider}`,
    );
  }

  // ─── Per-tenant object storage (platform superadmin) ───

  getTenantStorage(id: number): Observable<ApiResponse<TenantStorageConfig>> {
    return this.http.get<ApiResponse<TenantStorageConfig>>(`${this.apiUrl}/tenants/${id}/storage`);
  }

  saveTenantStorage(
    id: number,
    payload: TenantStorageConfigRequest,
  ): Observable<ApiResponse<TenantStorageConfig>> {
    return this.http.put<ApiResponse<TenantStorageConfig>>(
      `${this.apiUrl}/tenants/${id}/storage`,
      payload,
    );
  }

  deleteTenantStorage(id: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/tenants/${id}/storage`);
  }

  /** Usuarios miembros de un tenant (para el selector de logs/modelos). */
  listTenantUsers(id: number): Observable<ApiResponse<TenantUser[]>> {
    return this.http.get<ApiResponse<TenantUser[]>>(`${this.apiUrl}/admin/tenants/${id}/users`);
  }

  // ─── Per-tenant user management (platform superadmin) ───

  listTenantMembers(id: number): Observable<ApiResponse<TenantMember[]>> {
    return this.http.get<ApiResponse<TenantMember[]>>(`${this.apiUrl}/tenants/${id}/users`);
  }

  createTenantMember(
    id: number,
    payload: CreateTenantMemberRequest,
  ): Observable<ApiResponse<TenantMember>> {
    return this.http.post<ApiResponse<TenantMember>>(`${this.apiUrl}/tenants/${id}/users`, payload);
  }

  updateTenantMemberRole(
    tenantId: number,
    userId: number,
    roleLevel: number,
  ): Observable<ApiResponse<{ role_level: number; role_name: string }>> {
    return this.http.patch<ApiResponse<{ role_level: number; role_name: string }>>(
      `${this.apiUrl}/tenants/${tenantId}/users/${userId}/role`,
      { role_level: roleLevel },
    );
  }

  updateTenantMemberPermissions(
    tenantId: number,
    userId: number,
    permissions: string[],
  ): Observable<ApiResponse<{ permissions: string[] }>> {
    return this.http.put<ApiResponse<{ permissions: string[] }>>(
      `${this.apiUrl}/tenants/${tenantId}/users/${userId}/permissions`,
      { permissions },
    );
  }

  removeTenantMember(tenantId: number, userId: number): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/tenants/${tenantId}/users/${userId}`,
    );
  }

  listPlatformUsers(q?: string): Observable<ApiResponse<PlatformUser[]>> {
    return this.http.get<ApiResponse<PlatformUser[]>>(`${this.apiUrl}/tenants/platform-users`, {
      params: q ? { q } : {},
    });
  }

  listPermissionCatalog(): Observable<ApiResponse<PermissionDef[]>> {
    return this.http.get<ApiResponse<PermissionDef[]>>(`${this.apiUrl}/tenants/permissions`);
  }

  /** Login con selector de tenant (permisos de la membresía en el token). */
  loginTenant(
    username: string,
    password: string,
    tenantId: number,
  ): Observable<
    ApiResponse<{ token: string; tenant_id: number; tenant_slug?: string; permissions?: string[] }>
  > {
    return this.http.post<
      ApiResponse<{
        token: string;
        tenant_id: number;
        tenant_slug?: string;
        permissions?: string[];
      }>
    >(`${this.apiUrl}/auth/login-tenant`, { username, password, tenant_id: tenantId });
  }

  /** Descarga el archivo de exportación de credenciales (secretos en claro). */
  exportTenantCredentials(id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.apiUrl}/tenants/${id}/credentials/export`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** Importa credenciales desde el archivo de exportación (multipart). */
  importTenantCredentials(id: number, file: File): Observable<ApiResponse<{ imported: number }>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<{ imported: number }>>(
      `${this.apiUrl}/tenants/${id}/credentials/import`,
      form,
    );
  }

  /**
   * Header del tenant elegido en la consola: el back lo acepta solo para
   * superadmin y le da prioridad sobre el tenant_id del token.
   */
  private tenantHeaders(tenantSlug?: string): { headers?: Record<string, string> } {
    return tenantSlug ? { headers: { 'X-Tenant-Slug': tenantSlug } } : {};
  }

  /** Trazas de comunicaciones con APIs externas del tenant administrado. */
  listServerComms(
    page = 1,
    limit = 20,
    taskId?: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<ServerCommsPage>> {
    const params: Record<string, string | number> = { page, limit };
    if (taskId) params['task_id'] = taskId;
    return this.http.get<ApiResponse<ServerCommsPage>>(
      `${this.apiUrl}/agency/logs/server-communications`,
      { params, ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Una traza con sus bodies completos (la lista trae preview truncado). */
  getServerComm(id: string, tenantSlug?: string): Observable<ApiResponse<ServerCommunicationLog>> {
    return this.http.get<ApiResponse<ServerCommunicationLog>>(
      `${this.apiUrl}/agency/logs/server-communications/${encodeURIComponent(id)}`,
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Videos generados completados, con contexto de proyecto/pieza/usuario. */
  listGeneratedVideos(
    page = 1,
    limit = 20,
    eventId?: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<GeneratedVideosPage>> {
    const params: Record<string, number | string> = { page, limit };
    if (eventId) {
      params['event_id'] = eventId;
    }
    return this.http.get<ApiResponse<GeneratedVideosPage>>(`${this.apiUrl}/agency/videos`, {
      params,
      ...this.tenantHeaders(tenantSlug),
    });
  }

  /** Imágenes generadas completadas (misma forma que videos). */
  listGeneratedImages(
    page = 1,
    limit = 20,
    eventId?: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<GeneratedImagesPage>> {
    const params: Record<string, number | string> = { page, limit };
    if (eventId) {
      params['event_id'] = eventId;
    }
    return this.http.get<ApiResponse<GeneratedImagesPage>>(`${this.apiUrl}/agency/images`, {
      params,
      ...this.tenantHeaders(tenantSlug),
    });
  }

  // ─── Notification channels (video ready/failed fan-out) ───────────────

  /** Canales de notificación del tenant (shoutrrr: Slack, Telegram…). */
  listNotificationChannels(tenantSlug?: string): Observable<ApiResponse<NotificationChannel[]>> {
    return this.http.get<ApiResponse<NotificationChannel[]>>(`${this.apiUrl}/notify/channels`, {
      ...this.tenantHeaders(tenantSlug),
    });
  }

  createNotificationChannel(
    payload: NotificationChannelRequest,
    tenantSlug?: string,
  ): Observable<ApiResponse<NotificationChannel>> {
    return this.http.post<ApiResponse<NotificationChannel>>(
      `${this.apiUrl}/notify/channels`,
      payload,
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  updateNotificationChannel(
    id: string,
    payload: NotificationChannelRequest,
    tenantSlug?: string,
  ): Observable<ApiResponse<NotificationChannel>> {
    return this.http.put<ApiResponse<NotificationChannel>>(
      `${this.apiUrl}/notify/channels/${encodeURIComponent(id)}`,
      payload,
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  deleteNotificationChannel(id: string, tenantSlug?: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/notify/channels/${encodeURIComponent(id)}`,
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Envía un push de prueba a mis dispositivos (claves VAPID propias). */
  testPushNotifications(
    message = '',
    tenantSlug?: string,
  ): Observable<ApiResponse<{ sent_to: number }>> {
    return this.http.post<ApiResponse<{ sent_to: number }>>(
      `${this.apiUrl}/push/test`,
      { message },
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Graba un aviso de prueba en el centro nativo (campana). */
  testCenterNotifications(
    message = '',
    tenantSlug?: string,
  ): Observable<ApiResponse<{ message: string }>> {
    return this.http.post<ApiResponse<{ message: string }>>(
      `${this.apiUrl}/push/notifications/test`,
      { message },
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Envía un mensaje de prueba por un canal. */
  testNotificationChannel(
    id: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<{ message: string }>> {
    return this.http.post<ApiResponse<{ message: string }>>(
      `${this.apiUrl}/notify/channels/${encodeURIComponent(id)}/test`,
      {},
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  // ─── Papelera de generaciones (videos/imágenes) ──────────────────────

  /** Generaciones en la papelera (borrado hace menos de 30 días). */
  listTrashLogs(
    page = 1,
    limit = 20,
    resourceType?: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<GeneratedVideosPage>> {
    const params: Record<string, number | string> = { page, limit };
    if (resourceType) params['resource_type'] = resourceType;
    return this.http.get<ApiResponse<GeneratedVideosPage>>(`${this.apiUrl}/agency/gallery/trash`, {
      params,
      ...this.tenantHeaders(tenantSlug),
    });
  }

  /** Manda una generación a la papelera (recuperable 30 días). */
  trashGenerationLog(id: string, tenantSlug?: string): Observable<ApiResponse<{ message: string }>> {
    return this.http.put<ApiResponse<{ message: string }>>(
      `${this.apiUrl}/agency/logs/generation/${encodeURIComponent(id)}/trash`,
      {},
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Devuelve una generación de la papelera a la galería. */
  restoreGenerationLog(
    id: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<{ message: string }>> {
    return this.http.put<ApiResponse<{ message: string }>>(
      `${this.apiUrl}/agency/logs/generation/${encodeURIComponent(id)}/restore`,
      {},
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Borra una generación para siempre (fila + archivos locales). */
  deleteGenerationLogPermanent(
    id: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<{ message: string }>> {
    return this.http.delete<ApiResponse<{ message: string }>>(
      `${this.apiUrl}/agency/logs/generation/${encodeURIComponent(id)}/permanent`,
      { ...this.tenantHeaders(tenantSlug) },
    );
  }

  /** Archivos en la papelera (recursos subidos). */
  listTrashedFiles(tenantSlug?: string): Observable<ApiResponse<FileAsset[]>> {
    return this.http.get<ApiResponse<FileAsset[]>>(`${this.apiUrl}/files`, {
      params: { trashed: 'true' },
      ...this.tenantHeaders(tenantSlug),
    });
  }

  // ─── Inference worker: model weight management ────────────────────────

  /** Estado en vivo del worker (device, CUDA, modelos disponibles). */
  workerStatus(): Observable<ApiResponse<WorkerStatus>> {
    return this.http.get<ApiResponse<WorkerStatus>>(`${this.apiUrl}/worker/status`);
  }

  /** Lista todos los modelos del worker con estado de descarga y ruta en disco. */
  listWorkerModels(): Observable<ApiResponse<WorkerModel[]>> {
    return this.http
      .get<ApiResponse<WorkerModelWire[]>>(`${this.apiUrl}/worker/models`)
      .pipe(map((res) => ({ ...res, data: (res.data ?? []).map(toWorkerModel) })));
  }

  /** Inicia la descarga de los pesos de un modelo en el worker. */
  downloadWorkerModel(key: string, cancel = false): Observable<ApiResponse<WorkerModelState>> {
    return this.http.post<ApiResponse<WorkerModelState>>(
      `${this.apiUrl}/worker/models/${encodeURIComponent(key)}/download`,
      { cancel },
    );
  }

  /** Cancela la descarga en curso de un modelo en el worker. */
  cancelWorkerModelDownload(key: string): Observable<ApiResponse<WorkerModelState>> {
    return this.http.post<ApiResponse<WorkerModelState>>(
      `${this.apiUrl}/worker/models/${encodeURIComponent(key)}/cancel`,
      { cancel: true },
    );
  }

  /** Borra los pesos en disco de un modelo en el worker. */
  deleteWorkerModel(key: string): Observable<ApiResponse<WorkerModelState>> {
    return this.http.delete<ApiResponse<WorkerModelState>>(
      `${this.apiUrl}/worker/models/${encodeURIComponent(key)}`,
    );
  }

  // ─── Inference worker: artifacts (videos / images) ────────────────────

  /** Lista los artefactos disponibles en el artifact server del worker. */
  listWorkerArtifacts(): Observable<ApiResponse<WorkerArtifact[]>> {
    return this.http.get<ApiResponse<WorkerArtifact[]>>(`${this.apiUrl}/worker/artifacts`);
  }

  /** Borra un artefacto del artifact server del worker. */
  deleteWorkerArtifact(name: string): Observable<ApiResponse<{ deleted: string; ok: boolean }>> {
    return this.http.delete<ApiResponse<{ deleted: string; ok: boolean }>>(
      `${this.apiUrl}/worker/artifacts/${encodeURIComponent(name)}`,
    );
  }
}
