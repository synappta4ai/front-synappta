import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { unwrap } from '@utils/unwrap-api-response';

import {
  GpuWorker,
  ManagedWorkerModel,
  PairingCode,
  WorkerModelOperation,
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

  listWorkerModels(): Observable<ManagedWorkerModel[]> {
    return unwrap(this.repository.listWorkerModels());
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
}
