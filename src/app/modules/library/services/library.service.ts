import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse, Paginated } from '@interfaces/api.interface';

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
import { LibraryApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly libraryApiRepository = inject(LibraryApiRepository);

  uploadFile(file: File, category?: string, eventId?: string): Observable<FileAsset> {
    return unwrap(this.libraryApiRepository.uploadFile(file, category, eventId));
  }

  /** Asigna un recurso a un proyecto (evento). Idempotente. */
  linkFileEvent(fileId: string, eventId: string): Observable<null> {
    return unwrap(this.libraryApiRepository.linkFileEvent(fileId, eventId));
  }

  /** Quita la asignación de un recurso a un proyecto (evento). */
  unlinkFileEvent(fileId: string, eventId: string): Observable<null> {
    return unwrap(this.libraryApiRepository.unlinkFileEvent(fileId, eventId));
  }

  /** Recursos asignados a un proyecto (evento). */
  listFilesByEvent(eventId: string, category?: string): Observable<FileAsset[]> {
    return unwrap(this.libraryApiRepository.listFilesByEvent(eventId, category));
  }

  listFilesPaginated(filters: FileListFilters = {}): Observable<Paginated<FileAsset>> {
    return unwrap(this.libraryApiRepository.listFilesPaginated(filters));
  }

  listFiles(): Observable<FileAsset[]> {
    return unwrap(this.libraryApiRepository.listFiles());
  }

  getFile(id: string): Observable<FileAsset> {
    return unwrap(this.libraryApiRepository.getFile(id));
  }

  deleteFile(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deleteFile(id));
  }

  restoreFile(id: string): Observable<FileAsset> {
    return unwrap(this.libraryApiRepository.restoreFile(id));
  }

  hardDeleteFile(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.hardDeleteFile(id));
  }

  listIngredientsPaginated(filters: IngredientListFilters = {}): Observable<Paginated<Ingredient>> {
    return unwrap(this.libraryApiRepository.listIngredientsPaginated(filters));
  }

  listIngredients(): Observable<Ingredient[]> {
    return unwrap(this.libraryApiRepository.listIngredients());
  }

  getIngredient(id: string): Observable<Ingredient> {
    return unwrap(this.libraryApiRepository.getIngredient(id));
  }

  createIngredient(payload: CreateIngredientRequest): Observable<Ingredient> {
    return unwrap(this.libraryApiRepository.createIngredient(payload));
  }

  updateIngredient(id: string, payload: UpdateIngredientRequest): Observable<Ingredient> {
    return unwrap(this.libraryApiRepository.updateIngredient(id, payload));
  }

  deleteIngredient(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deleteIngredient(id));
  }

  listIngredientFiles(id: string): Observable<IngredientFile[]> {
    return unwrap(this.libraryApiRepository.listIngredientFiles(id));
  }

  addIngredientFile(id: string, payload: AddIngredientFileRequest): Observable<IngredientFile> {
    return unwrap(this.libraryApiRepository.addIngredientFile(id, payload));
  }

  removeIngredientFile(id: string, fileId: string): Observable<null> {
    return unwrap(this.libraryApiRepository.removeIngredientFile(id, fileId));
  }

  listPresetGroups(): Observable<PresetGroup[]> {
    return unwrap(this.libraryApiRepository.listPresetGroups());
  }

  createPresetGroup(payload: CreatePresetGroupRequest): Observable<PresetGroup> {
    return unwrap(this.libraryApiRepository.createPresetGroup(payload));
  }

  listPresets(): Observable<Preset[]> {
    return unwrap(this.libraryApiRepository.listPresets());
  }

  getPreset(id: string): Observable<Preset> {
    return unwrap(this.libraryApiRepository.getPreset(id));
  }

  createPreset(payload: CreatePresetRequest): Observable<Preset> {
    return unwrap(this.libraryApiRepository.createPreset(payload));
  }

  deletePreset(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deletePreset(id));
  }

  listSkills(): Observable<Skill[]> {
    return unwrap(this.libraryApiRepository.listSkills());
  }

  createSkill(payload: CreateSkillRequest): Observable<Skill> {
    return unwrap(this.libraryApiRepository.createSkill(payload));
  }

  deleteSkill(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deleteSkill(id));
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
