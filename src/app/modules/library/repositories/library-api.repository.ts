import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse, Paginated } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  AddIngredientFileRequest,
  CreateIngredientRequest,
  CreatePresetGroupRequest,
  CreatePresetRequest,
  CreateSkillRequest,
  FileAsset,
  FileListFilters,
  Ingredient,
  IngredientFile,
  IngredientWithFiles,
  IngredientListFilters,
  Preset,
  PresetGroup,
  Skill,
  UpdateIngredientRequest,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class LibraryApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  /**
   * Header del tenant elegido en la consola de administración: el back lo
   * acepta solo para superadmin y le da prioridad sobre el tenant del token.
   */
  private tenantHeaders(tenantSlug?: string): { headers?: Record<string, string> } {
    return tenantSlug ? { headers: { 'X-Tenant-Slug': tenantSlug } } : {};
  }

  uploadFile(
    file: File,
    category?: string,
    eventId?: string,
    tenantSlug?: string,
    storage?: 'persistent' | 'temp',
  ): Observable<ApiResponse<FileAsset>> {
    const form = new FormData();
    form.append('file', file);
    if (category) {
      form.append('category', category);
    }
    if (storage) {
      form.append('storage', storage);
    }
    if (eventId) {
      form.append('event_id', eventId);
    }
    return this.http.post<ApiResponse<FileAsset>>(
      `${this.apiUrl}/files/upload`,
      form,
      this.tenantHeaders(tenantSlug),
    );
  }

  /** Asigna un recurso a un proyecto (evento). Idempotente. */
  linkFileEvent(
    fileId: string,
    eventId: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(
      `${this.apiUrl}/files/${fileId}/event/${eventId}`,
      {},
      this.tenantHeaders(tenantSlug),
    );
  }

  /** Quita la asignación de un recurso a un proyecto (evento). */
  unlinkFileEvent(
    fileId: string,
    eventId: string,
    tenantSlug?: string,
  ): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/files/${fileId}/event/${eventId}`,
      this.tenantHeaders(tenantSlug),
    );
  }

  /** Recursos asignados a un proyecto (evento). */
  listFilesByEvent(eventId: string, category?: string): Observable<ApiResponse<FileAsset[]>> {
    const params: Record<string, string> = {};
    if (category) {
      params['category'] = category;
    }
    return this.http.get<ApiResponse<FileAsset[]>>(`${this.apiUrl}/files/by-event/${eventId}`, {
      params,
    });
  }

  listFilesPaginated(
    filters: FileListFilters = {},
    tenantSlug?: string,
  ): Observable<ApiResponse<Paginated<FileAsset>>> {
    const params = this.toParams(filters);
    return this.http.get<ApiResponse<Paginated<FileAsset>>>(`${this.apiUrl}/files/page`, {
      params,
      ...this.tenantHeaders(tenantSlug),
    });
  }

  listFiles(): Observable<ApiResponse<FileAsset[]>> {
    return this.http.get<ApiResponse<FileAsset[]>>(`${this.apiUrl}/files`);
  }

  /** Archivos en la papelera (trashed=true, con header de tenant). */
  listTrashedFiles(tenantSlug?: string): Observable<ApiResponse<FileAsset[]>> {
    return this.http.get<ApiResponse<FileAsset[]>>(`${this.apiUrl}/files`, {
      params: { trashed: 'true' },
      ...(tenantSlug ? { headers: { 'X-Tenant-Slug': tenantSlug } } : {}),
    });
  }

  getFile(id: string): Observable<ApiResponse<FileAsset>> {
    return this.http.get<ApiResponse<FileAsset>>(`${this.apiUrl}/files/${id}`);
  }

  deleteFile(id: string, tenantSlug?: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/files/${id}`,
      this.tenantHeaders(tenantSlug),
    );
  }

  restoreFile(id: string): Observable<ApiResponse<FileAsset>> {
    return this.http.post<ApiResponse<FileAsset>>(`${this.apiUrl}/files/${id}/restore`, {});
  }

  hardDeleteFile(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/files/${id}/hard`);
  }

  listIngredientsPaginated(
    filters: IngredientListFilters = {},
  ): Observable<ApiResponse<Paginated<Ingredient>>> {
    const params = this.toParams(filters);
    return this.http.get<ApiResponse<Paginated<Ingredient>>>(`${this.apiUrl}/ingredients/page`, {
      params,
    });
  }

  listIngredients(): Observable<ApiResponse<IngredientWithFiles[]>> {
    return this.http.get<ApiResponse<IngredientWithFiles[]>>(`${this.apiUrl}/ingredients`);
  }

  getIngredient(id: string): Observable<ApiResponse<IngredientWithFiles>> {
    return this.http.get<ApiResponse<IngredientWithFiles>>(`${this.apiUrl}/ingredients/${id}`);
  }

  createIngredient(
    payload: CreateIngredientRequest,
    tenantSlug?: string,
  ): Observable<ApiResponse<Ingredient>> {
    return this.http.post<ApiResponse<Ingredient>>(
      `${this.apiUrl}/ingredients`,
      payload,
      this.tenantHeaders(tenantSlug),
    );
  }

  updateIngredient(
    id: string,
    payload: UpdateIngredientRequest,
    tenantSlug?: string,
  ): Observable<ApiResponse<Ingredient>> {
    return this.http.patch<ApiResponse<Ingredient>>(
      `${this.apiUrl}/ingredients/${id}`,
      payload,
      this.tenantHeaders(tenantSlug),
    );
  }

  deleteIngredient(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/ingredients/${id}`);
  }

  listIngredientFiles(id: string): Observable<ApiResponse<IngredientFile[]>> {
    return this.http.get<ApiResponse<IngredientFile[]>>(`${this.apiUrl}/ingredients/${id}/files`);
  }

  addIngredientFile(
    id: string,
    payload: AddIngredientFileRequest,
    tenantSlug?: string,
  ): Observable<ApiResponse<IngredientFile>> {
    return this.http.post<ApiResponse<IngredientFile>>(
      `${this.apiUrl}/ingredients/${id}/files`,
      payload,
      this.tenantHeaders(tenantSlug),
    );
  }

  removeIngredientFile(id: string, fileId: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/ingredients/${id}/files/${fileId}`);
  }

  listPresetGroups(): Observable<ApiResponse<PresetGroup[]>> {
    return this.http.get<ApiResponse<PresetGroup[]>>(`${this.apiUrl}/presets/groups`);
  }

  createPresetGroup(payload: CreatePresetGroupRequest): Observable<ApiResponse<PresetGroup>> {
    return this.http.post<ApiResponse<PresetGroup>>(`${this.apiUrl}/presets/groups`, payload);
  }

  listPresets(): Observable<ApiResponse<Preset[]>> {
    return this.http.get<ApiResponse<Preset[]>>(`${this.apiUrl}/presets`);
  }

  getPreset(id: string): Observable<ApiResponse<Preset>> {
    return this.http.get<ApiResponse<Preset>>(`${this.apiUrl}/presets/${id}`);
  }

  createPreset(payload: CreatePresetRequest): Observable<ApiResponse<Preset>> {
    return this.http.post<ApiResponse<Preset>>(`${this.apiUrl}/presets`, payload);
  }

  deletePreset(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/presets/${id}`);
  }

  listSkills(): Observable<ApiResponse<Skill[]>> {
    return this.http.get<ApiResponse<Skill[]>>(`${this.apiUrl}/skills`);
  }

  createSkill(payload: CreateSkillRequest): Observable<ApiResponse<Skill>> {
    return this.http.post<ApiResponse<Skill>>(`${this.apiUrl}/skills`, payload);
  }

  deleteSkill(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/skills/${id}`);
  }

  private toParams(filters: FileListFilters | IngredientListFilters): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
