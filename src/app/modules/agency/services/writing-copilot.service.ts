import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';
import { WritingCopilotRequest, WritingCopilotResponse } from '../interfaces';
import { WritingCopilotApiRepository } from '../repositories/writing-copilot-api.repository';

/** Capa de negocio del agente Writing Copilot. */
@Injectable({ providedIn: 'root' })
export class WritingCopilotService {
  private readonly repository = inject(WritingCopilotApiRepository);

  /** Convierte una idea o guion en prompts cinematográficos. */
  chat(payload: WritingCopilotRequest): Observable<WritingCopilotResponse> {
    return unwrap(this.repository.chat(payload));
  }

  /** Si el agente está habilitado en el back (flag + skill válido). */
  available(): Observable<boolean> {
    return unwrap(this.repository.availability()).pipe(map((data) => data?.enabled === true));
  }
}
