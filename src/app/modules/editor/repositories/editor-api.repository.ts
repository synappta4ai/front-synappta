import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  EditorMediaInfo,
  EditorProject,
  EditorProjectRecord,
  EditorProjectSummary,
  RenderFormat,
  RenderJob,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class EditorApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  listProjects(): Observable<ApiResponse<EditorProjectSummary[]>> {
    return this.http.get<ApiResponse<EditorProjectSummary[]>>(`${this.apiUrl}/editor/projects`);
  }

  getProject(id: string): Observable<ApiResponse<EditorProjectRecord>> {
    return this.http.get<ApiResponse<EditorProjectRecord>>(`${this.apiUrl}/editor/projects/${id}`);
  }

  createProject(
    name: string,
    project: EditorProject,
  ): Observable<ApiResponse<EditorProjectRecord>> {
    return this.http.post<ApiResponse<EditorProjectRecord>>(`${this.apiUrl}/editor/projects`, {
      name,
      project,
    });
  }

  updateProject(id: string, name: string, project: EditorProject): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.apiUrl}/editor/projects/${id}`, {
      name,
      project,
    });
  }

  deleteProject(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/editor/projects/${id}`);
  }

  startRender(
    projectId: string,
    project: EditorProject,
    format: RenderFormat,
    saveToLibrary = false,
  ): Observable<ApiResponse<RenderJob>> {
    return this.http.post<ApiResponse<RenderJob>>(`${this.apiUrl}/render/jobs`, {
      project_id: projectId,
      project,
      format,
      save_to_library: saveToLibrary,
    });
  }

  /** Descarga el archivo final (el servidor lo borra al entregarlo). */
  downloadJob(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/render/jobs/${id}/download`, { responseType: 'blob' });
  }

  getJob(id: string): Observable<ApiResponse<RenderJob>> {
    return this.http.get<ApiResponse<RenderJob>>(`${this.apiUrl}/render/jobs/${id}`);
  }

  /** Medidas de un clip (duración, si tiene sonido y póster) calculadas en el servidor. */
  media(src: { fileId?: string; output?: string }): Observable<ApiResponse<EditorMediaInfo>> {
    return this.http.get<ApiResponse<EditorMediaInfo>>(`${this.apiUrl}/render/media`, {
      params: this.sourceParams(src),
    });
  }

  /** URL de un fotograma cacheado (sirve de miniatura para los videos). */
  poster(src: { fileId?: string; output?: string }): Observable<ApiResponse<{ url: string }>> {
    return this.http.get<ApiResponse<{ url: string }>>(`${this.apiUrl}/render/poster`, {
      params: this.sourceParams(src),
    });
  }

  private sourceParams(src: { fileId?: string; output?: string }): Record<string, string> {
    return src.fileId ? { file_id: src.fileId } : { src: src.output ?? '' };
  }
}
