import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Paginated } from '@interfaces/api.interface';
import { unwrap } from '@utils/unwrap-api-response';

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
import { LibraryApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly libraryApiRepository = inject(LibraryApiRepository);

  uploadFile(
    file: File,
    category?: string,
    eventId?: string,
    tenantSlug?: string,
    storage?: 'persistent' | 'temp',
  ): Observable<FileAsset> {
    return unwrap(this.libraryApiRepository.uploadFile(file, category, eventId, tenantSlug, storage));
  }

  /** Asigna un recurso a un proyecto (evento). Idempotente. */
  linkFileEvent(fileId: string, eventId: string, tenantSlug?: string): Observable<null> {
    return unwrap(this.libraryApiRepository.linkFileEvent(fileId, eventId, tenantSlug));
  }

  /** Quita la asignación de un recurso a un proyecto (evento). */
  unlinkFileEvent(fileId: string, eventId: string, tenantSlug?: string): Observable<null> {
    return unwrap(this.libraryApiRepository.unlinkFileEvent(fileId, eventId, tenantSlug));
  }

  /** Recursos asignados a un proyecto (evento). */
  listFilesByEvent(eventId: string, category?: string): Observable<FileAsset[]> {
    return unwrap(this.libraryApiRepository.listFilesByEvent(eventId, category));
  }

  listFilesPaginated(
    filters: FileListFilters = {},
    tenantSlug?: string,
  ): Observable<Paginated<FileAsset>> {
    return unwrap(this.libraryApiRepository.listFilesPaginated(filters, tenantSlug));
  }

  listFiles(): Observable<FileAsset[]> {
    return unwrap(this.libraryApiRepository.listFiles());
  }

  /** Archivos en la papelera (se borran solos a los 30 días). */
  listTrashedFiles(tenantSlug?: string): Observable<FileAsset[]> {
    return unwrap(this.libraryApiRepository.listTrashedFiles(tenantSlug));
  }

  getFile(id: string): Observable<FileAsset> {
    return unwrap(this.libraryApiRepository.getFile(id));
  }

  deleteFile(id: string, tenantSlug?: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deleteFile(id, tenantSlug));
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

  listIngredients(): Observable<IngredientWithFiles[]> {
    return unwrap(this.libraryApiRepository.listIngredients());
  }

  /** GET /ingredients/:id devuelve { ingredient, files } (rico). */
  getIngredient(id: string): Observable<IngredientWithFiles> {
    return unwrap(this.libraryApiRepository.getIngredient(id));
  }

  createIngredient(payload: CreateIngredientRequest, tenantSlug?: string): Observable<Ingredient> {
    return unwrap(this.libraryApiRepository.createIngredient(payload, tenantSlug));
  }

  updateIngredient(
    id: string,
    payload: UpdateIngredientRequest,
    tenantSlug?: string,
  ): Observable<Ingredient> {
    return unwrap(this.libraryApiRepository.updateIngredient(id, payload, tenantSlug));
  }

  deleteIngredient(id: string): Observable<null> {
    return unwrap(this.libraryApiRepository.deleteIngredient(id));
  }

  listIngredientFiles(id: string): Observable<IngredientFile[]> {
    return unwrap(this.libraryApiRepository.listIngredientFiles(id));
  }

  addIngredientFile(
    id: string,
    payload: AddIngredientFileRequest,
    tenantSlug?: string,
  ): Observable<IngredientFile> {
    return unwrap(this.libraryApiRepository.addIngredientFile(id, payload, tenantSlug));
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
