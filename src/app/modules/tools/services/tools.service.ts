import { inject, Injectable } from '@angular/core';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, concatMap, map, mergeMap, toArray } from 'rxjs/operators';

import { AgencyService } from '@modules/agency/services';
import {
  ContentItem,
  GenerateRequest,
  GenerateResponse,
  StatusResponse,
} from '@modules/agency/interfaces';
import { Event as Project, Piece } from '@modules/events/interfaces';
import { FileAsset, Ingredient } from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { StudioService } from '@modules/studio/services';
import { environment } from '@env/environment';

import {
  LOCATION_PIECE_CODE,
  LOCATION_SYSTEM_ASSET,
  POSE_SHEET_PIECE_CODE,
  POSE_SHEET_RATIO,
  POSE_SHEET_VARIANTS,
  STORYBOARD_PIECE_CODE,
  STORYBOARD_RATIO,
  STORYBOARD_SYSTEM_ASSET,
  LocationView,
  PoseSheetVariant,
} from '../interfaces';
import { ToolsApiRepository } from '../repositories';

export interface PoseSheetAnchor {
  project: Project;
  piece: Piece;
}

export interface SaveCharacterResult {
  file: FileAsset;
  ingredient: Ingredient;
}

export interface SaveLocationResult {
  ingredient: Ingredient;
  files: FileAsset[];
}

/**
 * Nombre de archivo de una vista de locación: "<nombre> ∕ <vista>". Se usa el
 * division slash (U+2215) en lugar de "/" porque `filepath.Base` de Go recorta
 * el nombre en el primer "/" real del multipart; U+2215 se ve idéntico.
 */
function locationFileName(name: string, viewLabel: string): string {
  const clean = (value: string): string =>
    value
      .replace(/[\\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const base = clean(name) || 'Location';
  const view = clean(viewLabel);
  return view ? `${base} \u2215 ${view}` : base;
}

/** Nombre de archivo seguro a partir del nombre del personaje. */
function slugifyFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'pose-sheet';
}

/**
 * Fachada de Herramientas (v1: solo Hoja de poses). Orquesta los services
 * existentes: AgencyService genera, LibraryService guarda en Recursos como
 * personaje, StudioService provee el anchor proyecto/pieza para los logs.
 * No crea endpoints nuevos en el back.
 */
@Injectable({ providedIn: 'root' })
export class ToolsService {
  private readonly repository = inject(ToolsApiRepository);
  private readonly agencyService = inject(AgencyService);
  private readonly libraryService = inject(LibraryService);
  private readonly studioService = inject(StudioService);
  private readonly apiOrigin = environment.API_URL.replace(/\/api\/v1\/?$/, '');
  /** El back valida generation_number como requerido (no acepta 0). */
  private sequence = 0;

  /** System prompt por defecto de la variante (editable por el usuario). */
  loadSystemPrompt(variant: PoseSheetVariant): Observable<string> {
    const def = POSE_SHEET_VARIANTS.find((v) => v.key === variant) ?? POSE_SHEET_VARIANTS[0];
    return this.repository.getSystemPrompt(def.asset);
  }

  /** Anchor proyecto/pieza para los logs (idempotente por piece code). */
  ensureAnchor(projectName: string): Observable<PoseSheetAnchor> {
    return this.studioService.ensureTakeSlot(projectName, POSE_SHEET_PIECE_CODE);
  }

  generatePoseSheet(request: {
    model: string;
    prompt: string;
    referenceIds: { id: string; name: string }[];
    eventId: string;
    pieceId: string;
    pieceCode: string;
  }): Observable<GenerateResponse> {
    const content: ContentItem[] = [
      ...request.referenceIds.map((ref): ContentItem => ({
        type: 'image',
        id: ref.id,
        name: ref.name,
      })),
      { type: 'text', text: request.prompt },
    ];
    const payload: GenerateRequest = {
      model: request.model,
      content,
      ratio: POSE_SHEET_RATIO,
      event_id: request.eventId,
      piece_id: request.pieceId,
      piece_code: request.pieceCode,
      generation_number: ++this.sequence,
    };
    return this.agencyService.generate('image', payload);
  }

  trackPoseSheet(taskId: string): Observable<StatusResponse> {
    return this.agencyService.pollTaskUntilDone('image', taskId);
  }

  /** System prompt por defecto del storyboard (editable por el usuario). */
  loadStoryboardPrompt(): Observable<string> {
    return this.repository.getSystemPrompt(STORYBOARD_SYSTEM_ASSET);
  }

  ensureStoryboardAnchor(projectName: string): Observable<PoseSheetAnchor> {
    return this.studioService.ensureTakeSlot(projectName, STORYBOARD_PIECE_CODE);
  }

  generateStoryboard(request: {
    model: string;
    prompt: string;
    resolution?: string;
    referenceIds: { id: string; name: string }[];
    eventId: string;
    pieceId: string;
    pieceCode: string;
  }): Observable<GenerateResponse> {
    const content: ContentItem[] = [
      ...request.referenceIds.map((ref): ContentItem => ({
        type: 'image',
        id: ref.id,
        name: ref.name,
      })),
      { type: 'text', text: request.prompt },
    ];
    const payload: GenerateRequest = {
      model: request.model,
      content,
      ratio: STORYBOARD_RATIO,
      ...(request.resolution ? { resolution: request.resolution } : {}),
      event_id: request.eventId,
      piece_id: request.pieceId,
      piece_code: request.pieceCode,
      generation_number: ++this.sequence,
    };
    return this.agencyService.generate('image', payload);
  }

  trackStoryboard(taskId: string): Observable<StatusResponse> {
    return this.agencyService.pollTaskUntilDone('image', taskId);
  }

  /** System prompt por defecto de la locación (editable por el usuario). */
  loadLocationPrompt(): Observable<string> {
    return this.repository.getSystemPrompt(LOCATION_SYSTEM_ASSET);
  }

  /** Anchor proyecto/pieza para los logs (idempotente por piece code). */
  ensureLocationAnchor(projectName: string): Observable<PoseSheetAnchor> {
    return this.studioService.ensureTakeSlot(projectName, LOCATION_PIECE_CODE);
  }

  generateLocation(request: {
    model: string;
    prompt: string;
    ratio: string;
    resolution: string;
    referenceIds: { id: string; name: string }[];
    eventId: string;
    pieceId: string;
    pieceCode: string;
  }): Observable<GenerateResponse> {
    const content: ContentItem[] = [
      ...request.referenceIds.map((ref): ContentItem => ({
        type: 'image',
        id: ref.id,
        name: ref.name,
      })),
      { type: 'text', text: request.prompt },
    ];
    const payload: GenerateRequest = {
      model: request.model,
      content,
      ratio: request.ratio,
      resolution: request.resolution,
      event_id: request.eventId,
      piece_id: request.pieceId,
      piece_code: request.pieceCode,
      generation_number: ++this.sequence,
    };
    return this.agencyService.generate('image', payload);
  }

  /**
   * Guarda la locación generada en Recursos: un mismo ingrediente location
   * con una imagen por vista elegida. El nombre de cada archivo es
   * "<nombre> ∕ <vista>", así todas las vistas quedan agrupadas en el mismo
   * recurso.
   *
   * Primero descarga y sube todas las vistas (una que falle se omite y el
   * resto sigue) y recién después crea el recurso: si una descarga se corta
   * antes de tiempo no queda un ingrediente vacío.
   */
  saveLocationViewsAsIngredient(request: {
    name: string;
    description?: string;
    eventId: string;
    photos: readonly { outputUrl: string; viewLabel: string }[];
  }): Observable<SaveLocationResult> {
    const failures: string[] = [];
    return from(request.photos).pipe(
      concatMap((photo) =>
        from(
          this.fetchAsFile(photo.outputUrl, locationFileName(request.name, photo.viewLabel)),
        ).pipe(
          mergeMap((file) => this.libraryService.uploadFile(file, 'images', request.eventId)),
          catchError((err: unknown) => {
            failures.push(err instanceof Error ? err.message : String(err));
            return of(null);
          }),
        ),
      ),
      toArray(),
      map((assets) => assets.filter((asset): asset is FileAsset => asset !== null)),
      mergeMap((assets) => {
        if (assets.length === 0) {
          return throwError(() => new Error(failures[0] ?? 'no views could be saved'));
        }
        return this.libraryService
          .createIngredient({
            type: 'location',
            name: request.name,
            description: request.description,
          })
          .pipe(
            mergeMap((ingredient) =>
              from(assets).pipe(
                concatMap((asset) =>
                  this.libraryService
                    .addIngredientFile(ingredient.id, { file_id: asset.id })
                    .pipe(map(() => asset)),
                ),
                toArray(),
                map((files) => ({ ingredient, files })),
              ),
            ),
          );
      }),
    );
  }

  /**
   * Guarda la hoja generada en Recursos como personaje: descarga el output,
   * lo sube a la biblioteca (images), crea el ingrediente character y lo
   * vincula. Así queda disponible como ingrediente en toda la app.
   */
  savePoseSheetAsCharacter(request: {
    outputUrl: string;
    name: string;
    description?: string;
    eventId: string;
  }): Observable<SaveCharacterResult> {
    return from(this.downloadOutput(request.outputUrl, request.name)).pipe(
      mergeMap((file) => this.libraryService.uploadFile(file, 'images', request.eventId)),
      mergeMap((asset) =>
        this.libraryService
          .createIngredient({
            type: 'character',
            name: request.name,
            description: request.description,
          })
          .pipe(
            mergeMap((ingredient) =>
              this.libraryService
                .addIngredientFile(ingredient.id, { file_id: asset.id })
                .pipe(map(() => ({ file: asset, ingredient }))),
            ),
          ),
      ),
    );
  }

  private downloadOutput(url: string, name: string): Promise<File> {
    return this.fetchAsFile(url, slugifyFileName(name));
  }

  private async fetchAsFile(url: string, fileName: string): Promise<File> {
    const absolute = /^https?:\/\//i.test(url) ? url : `${this.apiOrigin}${url}`;
    const res = await fetch(absolute);
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    return new File([blob], `${fileName}.${ext}`, {
      type: blob.type || 'image/png',
    });
  }
}
