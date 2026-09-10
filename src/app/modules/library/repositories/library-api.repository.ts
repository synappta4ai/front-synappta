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
  IngredientListFilters,
  Preset,
  PresetGroup,
  Skill,
  UpdateIngredientRequest,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class LibraryApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  uploadFile(file: File, category?: string): Observable<ApiResponse<FileAsset>> {
    const form = new FormData();
    form.append('file', file);
    if (category) {
      form.append('category', category);
    }
    return this.http.post<ApiResponse<FileAsset>>(`${this.apiUrl}/files/upload`, form);
  }

  listFilesPaginated(filters: FileListFilters = {}): Observable<ApiResponse<Paginated<FileAsset>>> {
    const params = this.toParams(filters);
    return this.http.get<ApiResponse<Paginated<FileAsset>>>(`${this.apiUrl}/files/page`, {
      params,
    });
  }

  listFiles(): Observable<ApiResponse<FileAsset[]>> {
    return this.http.get<ApiResponse<FileAsset[]>>(`${this.apiUrl}/files`);
  }

  getFile(id: string): Observable<ApiResponse<FileAsset>> {
    return this.http.get<ApiResponse<FileAsset>>(`${this.apiUrl}/files/${id}`);
  }

  deleteFile(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/files/${id}`);
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

  listIngredients(): Observable<ApiResponse<Ingredient[]>> {
    return this.http.get<ApiResponse<Ingredient[]>>(`${this.apiUrl}/ingredients`);
  }

  getIngredient(id: string): Observable<ApiResponse<Ingredient>> {
    return this.http.get<ApiResponse<Ingredient>>(`${this.apiUrl}/ingredients/${id}`);
  }

  createIngredient(payload: CreateIngredientRequest): Observable<ApiResponse<Ingredient>> {
    return this.http.post<ApiResponse<Ingredient>>(`${this.apiUrl}/ingredients`, payload);
  }

  updateIngredient(
    id: string,
    payload: UpdateIngredientRequest,
  ): Observable<ApiResponse<Ingredient>> {
    return this.http.patch<ApiResponse<Ingredient>>(`${this.apiUrl}/ingredients/${id}`, payload);
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
  ): Observable<ApiResponse<IngredientFile>> {
    return this.http.post<ApiResponse<IngredientFile>>(
      `${this.apiUrl}/ingredients/${id}/files`,
      payload,
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
