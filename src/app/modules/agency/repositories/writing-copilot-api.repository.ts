import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';
import { WritingCopilotRequest, WritingCopilotResponse } from '../interfaces';

/** Única capa que toca HttpClient para el agente Writing Copilot. */
@Injectable({ providedIn: 'root' })
export class WritingCopilotApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  chat(payload: WritingCopilotRequest): Observable<ApiResponse<WritingCopilotResponse>> {
    return this.http.post<ApiResponse<WritingCopilotResponse>>(`${this.apiUrl}/writing-copilot/chat`, payload);
  }

  availability(): Observable<ApiResponse<{ enabled: boolean }>> {
    return this.http.get<ApiResponse<{ enabled: boolean }>>(`${this.apiUrl}/writing-copilot/availability`);
  }
}
