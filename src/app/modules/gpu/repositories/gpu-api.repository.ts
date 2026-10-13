import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import { GpuWorker, PairingCode } from '../interfaces/gpu.interface';

/**
 * API del panel "Tu GPU" (back: internal/modules/workerbridge).
 * Los endpoints son del tenant del token JWT; el back aplica RequireRole(1).
 */
@Injectable({ providedIn: 'root' })
export class GpuApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  listWorkers(): Observable<ApiResponse<GpuWorker[]>> {
    return this.http.get<ApiResponse<GpuWorker[]>>(`${this.apiUrl}/gpu/workers`);
  }

  createPairingCode(): Observable<ApiResponse<PairingCode>> {
    return this.http.post<ApiResponse<PairingCode>>(`${this.apiUrl}/gpu/pairing-code`, {});
  }

  revokeWorker(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/gpu/workers/${id}`);
  }
}
