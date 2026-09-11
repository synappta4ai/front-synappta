import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AgencyService } from '@modules/agency/services';
import {
  AiModel,
  GenerateRequest,
  GenerateResponse,
  StatusResponse,
} from '@modules/agency/interfaces';

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly agencyService = inject(AgencyService);

  listVideoModels(): Observable<AiModel[]> {
    return this.agencyService.listModelsByModality('video');
  }

  generateVideo(payload: GenerateRequest): Observable<GenerateResponse> {
    return this.agencyService.generate('video', payload);
  }

  getVideoStatus(taskId: string): Observable<StatusResponse> {
    return this.agencyService.getStatus('video', taskId);
  }

  pollVideoUntilDone(taskId: string): Observable<StatusResponse> {
    return this.agencyService.pollTaskUntilDone('video', taskId);
  }
}
