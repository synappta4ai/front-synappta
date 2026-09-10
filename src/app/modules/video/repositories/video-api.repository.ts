import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AgencyApiRepository } from '@modules/agency/repositories';
import { ApiResponse } from '@interfaces/api.interface';
import { GenerateRequest, GenerateResponse, StatusResponse } from '@modules/agency/interfaces';

@Injectable({ providedIn: 'root' })
export class VideoApiRepository {
  private readonly agencyApiRepository = inject(AgencyApiRepository);

  generateVideo(payload: GenerateRequest): Observable<ApiResponse<GenerateResponse>> {
    return this.agencyApiRepository.generate('video', payload);
  }

  getVideoStatus(taskId: string): Observable<ApiResponse<StatusResponse>> {
    return this.agencyApiRepository.getStatus('video', taskId);
  }
}
