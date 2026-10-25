import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';
import {
  AnalyzeVideoRequest,
  ComposeRequest,
  ComposeResponse,
  VideoAnalysis,
  VideoFormat,
} from '../interfaces';
import { InfoproductApiRepository } from '../repositories/infoproduct-api.repository';

/** Slug del grupo de presets donde viven los formatos de video. */
export const VIDEO_FORMATS_GROUP = 'formats';

@Injectable({ providedIn: 'root' })
export class InfoproductService {
  private readonly repository = inject(InfoproductApiRepository);

  analyze(payload: AnalyzeVideoRequest): Observable<VideoAnalysis> {
    return unwrap(this.repository.analyze(payload));
  }

  compose(payload: ComposeRequest): Observable<ComposeResponse> {
    return unwrap(this.repository.compose(payload));
  }

  /** Formatos activos del grupo "formats" (vacío mientras no haya presets). */
  listFormats(): Observable<VideoFormat[]> {
    return unwrap(this.repository.listPresetGroups()).pipe(
      map((groups) => (groups ?? []).find((g) => g.slug === VIDEO_FORMATS_GROUP)),
      switchMap((group) =>
        group ? unwrap(this.repository.listPresetsByGroup(group.id)) : of<VideoFormat[]>([]),
      ),
      map((formats) => (formats ?? []).filter((f) => f.active)),
    );
  }
}
