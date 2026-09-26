import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

import { AiModel } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';
import { EventsService } from '@modules/events/services';
import { Event as Project, Piece } from '@modules/events/interfaces';

import { StudioModel } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class StudioService {
  private readonly agencyService = inject(AgencyService);
  private readonly eventsService = inject(EventsService);

  /** Maps the raw catalog (merged API + downloaded) into picker entries. */
  listModels(): Observable<StudioModel[]> {
    return this.agencyService.listModels().pipe(
      map((models: AiModel[]) =>
        models
          .filter((m) => m.modality !== 'text')
          .map((m): StudioModel => {
            const raw = m as AiModel & {
              type?: string;
              downloaded?: { vram_gb?: number; available?: boolean } | null;
            };
            const isDownloaded = raw.type === 'downloaded';
            return {
              name: m.name,
              displayName: m.display_name ?? m.name,
              type: isDownloaded ? 'downloaded' : 'api',
              modality: m.modality,
              badge: isDownloaded ? 'worker' : String(m.credential_provider ?? 'api'),
              vramGb: raw.downloaded?.vram_gb,
              available: raw.downloaded?.available ?? true,
              source: m,
            };
          }),
      ),
    );
  }

  /**
   * Studio generations need a project/piece anchor for the backend logs.
   * Auto-provisions a "Studio" project (and a per-slot piece) so creators
   * never fill forms mid-flow. Idempotent per piece code.
   */
  ensureTakeSlot(pieceName: string, pieceCode: string): Observable<{ project: Project; piece: Piece }> {
    return this.eventsService.listEvents().pipe(
      mergeMap((projects) => {
        const existing = projects.find((p) => p.name === 'Studio');
        return existing ? of(existing) : this.createStudioProject();
      }),
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
