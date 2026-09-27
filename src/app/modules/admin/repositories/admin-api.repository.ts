import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  CreateTenantRequest,
  GeneratedImagesPage,
  GeneratedVideosPage,
  ServerCommsPage,
  Tenant,
  TenantCredential,
  TenantModel,
  TenantUser,
  UpsertTenantCredentialRequest,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class AdminApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listTenants(): Observable<ApiResponse<Tenant[]>> {
    return this.http.get<ApiResponse<Tenant[]>>(`${this.apiUrl}/tenants`);
  }

  createTenant(payload: CreateTenantRequest): Observable<ApiResponse<Tenant>> {
    return this.http.post<ApiResponse<Tenant>>(`${this.apiUrl}/tenants`, payload);
  }

  deactivateTenant(id: number): Observable<ApiResponse<null>> {
    return this.http.patch<ApiResponse<null>>(`${this.apiUrl}/tenants/${id}/deactivate`, {});
  }

  // ─── Per-tenant models & credentials (platform superadmin) ───

  listTenantModels(id: number): Observable<ApiResponse<TenantModel[]>> {
    return this.http.get<ApiResponse<TenantModel[]>>(`${this.apiUrl}/tenants/${id}/models`);
  }

  listTenantCredentials(id: number): Observable<ApiResponse<TenantCredential[]>> {
    return this.http.get<ApiResponse<TenantCredential[]>>(`${this.apiUrl}/tenants/${id}/credentials`);
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

  /** Usuarios miembros de un tenant (para el selector de logs/modelos). */
  listTenantUsers(id: number): Observable<ApiResponse<TenantUser[]>> {
    return this.http.get<ApiResponse<TenantUser[]>>(
      `${this.apiUrl}/admin/tenants/${id}/users`,
    );
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

  /** Trazas de comunicaciones con APIs externas (scopped al tenant del token). */
  listServerComms(page = 1, limit = 20, taskId?: string): Observable<ApiResponse<ServerCommsPage>> {
    const params: Record<string, string | number> = { page, limit };
    if (taskId) params['task_id'] = taskId;
    return this.http.get<ApiResponse<ServerCommsPage>>(
      `${this.apiUrl}/agency/logs/server-communications`,
      { params },
    );
  }

  /** Videos generados completados, con contexto de proyecto/pieza/usuario. */
  listGeneratedVideos(page = 1, limit = 20, eventId?: string): Observable<ApiResponse<GeneratedVideosPage>> {
    const params: Record<string, number | string> = { page, limit };
    if (eventId) {
      params['event_id'] = eventId;
    }
    return this.http.get<ApiResponse<GeneratedVideosPage>>(`${this.apiUrl}/agency/videos`, { params });
  }

  /** Imágenes generadas completadas (misma forma que videos). */
  listGeneratedImages(page = 1, limit = 20, eventId?: string): Observable<ApiResponse<GeneratedImagesPage>> {
    const params: Record<string, number | string> = { page, limit };
    if (eventId) {
      params['event_id'] = eventId;
    }
    return this.http.get<ApiResponse<GeneratedImagesPage>>(`${this.apiUrl}/agency/images`, { params });
  }
}
