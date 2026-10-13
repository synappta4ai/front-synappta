import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

import { AgencyService } from '@modules/agency/services';
import {
  AiModel,
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
  POSE_SHEET_MODEL_NAMES,
  POSE_SHEET_PIECE_CODE,
  POSE_SHEET_RATIO,
  POSE_SHEET_VARIANTS,
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

  /** Solo Soul 2 + Nano Banana Pro (nombres exactos del catálogo). */
  listPoseSheetModels(): Observable<AiModel[]> {
    return this.agencyService
      .listModelsByModality('image')
      .pipe(map((models) => models.filter((m) => POSE_SHEET_MODEL_NAMES.includes(m.name))));
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
    return from(this.downloadOutput(request.outputUrl)).pipe(
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

  private async downloadOutput(url: string): Promise<File> {
    const absolute = /^https?:\/\//i.test(url) ? url : `${this.apiOrigin}${url}`;
    const res = await fetch(absolute);
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    return new File([blob], `pose-sheet.${ext}`, { type: blob.type || 'image/png' });
  }
}
