import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';

import {
  EditorMediaInfo,
  EditorProject,
  EditorProjectRecord,
  EditorProjectSummary,
  RenderFormat,
  RenderJob,
} from '../interfaces';
import { EditorApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class EditorService {
  private readonly editorApiRepository = inject(EditorApiRepository);

  listProjects(): Observable<EditorProjectSummary[]> {
    return unwrap(this.editorApiRepository.listProjects());
  }

  getProject(id: string): Observable<EditorProjectRecord> {
    return unwrap(this.editorApiRepository.getProject(id));
  }

  createProject(name: string, project: EditorProject): Observable<EditorProjectRecord> {
    return unwrap(this.editorApiRepository.createProject(name, project));
  }

  updateProject(id: string, name: string, project: EditorProject): Observable<null> {
    return unwrap(this.editorApiRepository.updateProject(id, name, project));
  }

  deleteProject(id: string): Observable<null> {
    return unwrap(this.editorApiRepository.deleteProject(id));
  }

  /** Encola el render en el servidor (responde enseguida; luego se consulta el job). */
  startRender(
    projectId: string,
    project: EditorProject,
    format: RenderFormat,
    saveToLibrary = false,
  ): Observable<RenderJob> {
    return unwrap(this.editorApiRepository.startRender(projectId, project, format, saveToLibrary));
  }

  downloadJob(id: string): Observable<Blob> {
    return this.editorApiRepository.downloadJob(id);
  }

  getJob(id: string): Observable<RenderJob> {
    return unwrap(this.editorApiRepository.getJob(id));
  }

  media(src: { fileId?: string; output?: string }): Observable<EditorMediaInfo> {
    return unwrap(this.editorApiRepository.media(src));
  }

  poster(src: { fileId?: string; output?: string }): Observable<{ url: string }> {
    return unwrap(this.editorApiRepository.poster(src));
  }
}
