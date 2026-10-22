import { inject, Injectable } from '@angular/core';
import { firstValueFrom, map, Observable } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';

import {
  BulkDeleteResult,
  GpuWorker,
  ManagedWorkerModel,
  PairingCode,
  WorkerModelOperation,
  WorkerUpdatePayloadResponse,
  WorkerUpdateResponse,
} from '../interfaces/gpu.interface';
import { GpuApiRepository } from '../repositories/gpu-api.repository';

/** Fachada del panel "Tu GPU": lista, emparejamiento y revocación. */
@Injectable({ providedIn: 'root' })
export class GpuService {
  private readonly repository = inject(GpuApiRepository);

  listWorkers(): Observable<GpuWorker[]> {
    return unwrap(this.repository.listWorkers());
  }

  createPairingCode(): Observable<PairingCode> {
    return unwrap(this.repository.createPairingCode());
  }

  revokeWorker(id: string): Observable<null> {
    return unwrap(this.repository.revokeWorker(id));
  }

  /** Modelos + origen: bridge = snapshot solo lectura, sin gestión de pesos. */
  listWorkerModels(): Observable<{ models: ManagedWorkerModel[]; bridge: boolean }> {
    return this.repository.listWorkerModelsResponse().pipe(
      map((resp) => {
        const body = resp.body;
        if (!body || body.success === false) {
          throw new Error(body?.message || 'Request failed');
        }
        return {
          models: body.data ?? [],
          bridge: resp.headers.get('X-Worker-Source') === 'bridge',
        };
      }),
    );
  }

  downloadWorkerModel(key: string): Observable<WorkerModelOperation> {
    return unwrap(this.repository.downloadWorkerModel(key));
  }

  cancelWorkerModelDownload(key: string): Observable<WorkerModelOperation> {
    return unwrap(this.repository.cancelWorkerModelDownload(key));
  }

  deleteWorkerModel(key: string): Observable<WorkerModelOperation> {
    return unwrap(this.repository.deleteWorkerModel(key));
  }

  deleteAllWorkerModels(): Observable<BulkDeleteResult> {
    return unwrap(this.repository.deleteAllWorkerModels());
  }

  /** Sube el .zip nuevo del worker al back. Devuelve la URL pública del payload. */
  async uploadWorkerUpdatePayload(file: File): Promise<string> {
    const resp = await firstValueFrom(
      this.repository.uploadWorkerUpdatePayload(file),
    );
    if (!resp.success || !resp.data) {
      throw new Error(resp.message || 'No se pudo subir el payload');
    }
    return resp.data.url;
  }

  /** Ordena al worker que se auto-actualice descargando el payload de `url`. */
  async updateWorker(url: string, sha256?: string): Promise<WorkerUpdateResponse> {
    return firstValueFrom(this.repository.updateWorker(url, sha256));
  }

  /** Encola la descarga de un modelo en una GPU emparejada (modo bridge). */
  requestBridgeDownload(workerId: string, key: string): Observable<{ worker_id: string; model_key: string }> {
    return unwrap(this.repository.requestBridgeDownload(workerId, key));
  }
}
