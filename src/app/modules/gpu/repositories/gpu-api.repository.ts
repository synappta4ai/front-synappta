import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  BulkDeleteResult,
  GpuWorker,
  ManagedWorkerModel,
  PairingCode,
  WorkerModelOperation,
  WorkerUpdatePayloadResponse,
  WorkerUpdateResponse,
} from '../interfaces/gpu.interface';

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

  /** Respuesta completa: el header X-Worker-Source dice si es central o bridge. */
  listWorkerModelsResponse(): Observable<HttpResponse<ApiResponse<ManagedWorkerModel[]>>> {
    return this.http.get<ApiResponse<ManagedWorkerModel[]>>(`${this.apiUrl}/worker/models`, {
      observe: 'response',
    });
  }

  /** Sube el .zip nuevo del worker al back (se sirve luego vía /outputs). */
  uploadWorkerUpdatePayload(file: File): Observable<ApiResponse<WorkerUpdatePayloadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApiResponse<WorkerUpdatePayloadResponse>>(
      `${this.apiUrl}/worker/update-payload`,
      formData,
    );
  }

  /** Ordena al worker que se auto-actualice descargando el payload de `url`. */
  updateWorker(url: string, sha256?: string): Observable<WorkerUpdateResponse> {
    return this.http.post<WorkerUpdateResponse>(`${this.apiUrl}/worker/update`, {
      url,
      sha256,
    });
  }

  downloadWorkerModel(key: string): Observable<ApiResponse<WorkerModelOperation>> {
    const encoded = encodeURIComponent(key);
    return this.http.post<ApiResponse<WorkerModelOperation>>(
      `${this.apiUrl}/worker/models/${encoded}/download`,
      {},
    );
  }

  cancelWorkerModelDownload(key: string): Observable<ApiResponse<WorkerModelOperation>> {
    const encoded = encodeURIComponent(key);
    return this.http.post<ApiResponse<WorkerModelOperation>>(
      `${this.apiUrl}/worker/models/${encoded}/cancel`,
      {},
    );
  }

  deleteWorkerModel(key: string): Observable<ApiResponse<WorkerModelOperation>> {
    const encoded = encodeURIComponent(key);
    return this.http.delete<ApiResponse<WorkerModelOperation>>(
      `${this.apiUrl}/worker/models/${encoded}`,
    );
  }

  deleteAllWorkerModels(): Observable<ApiResponse<BulkDeleteResult>> {
    return this.http.delete<ApiResponse<BulkDeleteResult>>(`${this.apiUrl}/worker/models`);
  }

  /**
   * Descarga en una GPU emparejada (modo bridge): el admin la encola y el
   * agente la recoge en el próximo heartbeat (back: workerbridge).
   */
  requestBridgeDownload(workerId: string, key: string): Observable<ApiResponse<{ worker_id: string; model_key: string }>> {
    const encoded = encodeURIComponent(key);
    return this.http.post<ApiResponse<{ worker_id: string; model_key: string }>>(
      `${this.apiUrl}/gpu/workers/${workerId}/models/${encoded}/download`,
      {},
    );
  }
}
