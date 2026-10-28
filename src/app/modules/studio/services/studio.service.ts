import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

import { AiModel } from '@modules/agency/interfaces';
import { ModelCatalogService } from '@modules/agency/services';
import { EventsService } from '@modules/events/services';
import { Event as Project, Piece } from '@modules/events/interfaces';

import { StudioModel } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class StudioService {
  private readonly catalog = inject(ModelCatalogService);
  private readonly eventsService = inject(EventsService);

  /** Maps the raw catalog (merged API + downloaded) into picker entries. */
  listModels(): Observable<StudioModel[]> {
    return this.catalog.all().pipe(
      map((models: AiModel[]) =>
        models
          .filter((m) => m.modality !== 'text')
          .map((m): StudioModel => {
            const isDownloaded = m.type === 'downloaded';
            return {
              name: m.name,
              displayName: m.display_name ?? m.name,
              type: isDownloaded ? 'downloaded' : 'api',
              modality: m.modality,
              badge: isDownloaded ? 'worker' : String(m.credential_provider ?? 'api'),
              vramGb: m.downloaded?.vram_gb,
              available: m.downloaded?.available ?? true,
              source: m,
            };
          }),
      ),
    );
  }

  /**
   * Studio generations need a project/piece anchor for the backend logs.
   * When projectId is provided that project is used directly (centralización
   * por proyecto); otherwise an auto "Studio" project is provisioned so
   * creators never fill forms mid-flow. Idempotent per piece code.
   */
  ensureTakeSlot(
    pieceName: string,
    pieceCode: string,
    projectId?: string,
  ): Observable<{ project: Project; piece: Piece }> {
    const project$ = projectId
      ? this.eventsService.listEvents().pipe(
          mergeMap((projects) => {
            const chosen = projects.find((p) => p.id === projectId);
            return chosen ? of(chosen) : this.createStudioProject();
          }),
        )
      : this.eventsService.listEvents().pipe(
          mergeMap((projects) => {
            const existing = projects.find((p) => p.name === 'Studio');
            return existing ? of(existing) : this.createStudioProject();
          }),
        );
    return project$.pipe(
      mergeMap((project) =>
        this.eventsService.listPieces({ event_id: project.id }).pipe(
          mergeMap((pieces) => {
            const existing = pieces.find((p) => p.piece_code === pieceCode);
            return existing
              ? of({ project, piece: existing })
              : this.eventsService
                  .createPiece(project.id, {
                    number: pieces.length + 1,
                    piece_code: pieceCode,
                    name: pieceName,
                    type: 'video',
                  })
                  .pipe(map((piece) => ({ project, piece })));
          }),
        ),
      ),
    );
  }

  private createStudioProject(): Observable<Project> {
    return this.eventsService.createEvent({
      name: 'Studio',
      description: 'Generaciones del modo Studio',
    });
  }
}
