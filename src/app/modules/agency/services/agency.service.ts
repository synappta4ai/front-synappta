import { inject, Injectable } from '@angular/core';
import { Observable, timer } from 'rxjs';
import { exhaustMap, takeWhile } from 'rxjs/operators';

import {
  AiModel,
  BriefExtraction,
  CostSummary,
  Credential,
  GenerateRequest,
  GenerateResponse,
  GenerationLog,
  GenerationLogsFilters,
  GenerationLogsPage,
  GeneratedAsset,
  Modality,
  ModelAsset,
  PreviewPayloadResponse,
  ServerCommunication,
  ServerCommsFilters,
  ServerCommsPage,
  StatusResponse,
  SyncAssetResult,
  UpsertCredentialRequest,
} from '../interfaces';
import { AgencyApiRepository } from '../repositories';
import { unwrap } from '@utils/unwrap-api-response';
import { WorkerAddressService } from '../../../core/services/worker-address.service';

const TERMINAL_STATUSES: readonly string[] = ['succeeded', 'completed', 'failed', 'cancelled'];

@Injectable({ providedIn: 'root' })
export class AgencyService {
  private readonly agencyApiRepository = inject(AgencyApiRepository);
  private readonly workerAddress = inject(WorkerAddressService);

  listModels(): Observable<AiModel[]> {
    return unwrap(this.agencyApiRepository.listModels());
  }

  listModelsByModality(modality: Modality): Observable<AiModel[]> {
    return unwrap(this.agencyApiRepository.listModelsByModality(modality));
  }

  listCredentials(): Observable<Credential[]> {
    return unwrap(this.agencyApiRepository.listCredentials());
  }

  upsertCredential(payload: UpsertCredentialRequest): Observable<null> {
    return unwrap(this.agencyApiRepository.upsertCredential(payload));
  }

  deleteCredential(provider: Credential['provider']): Observable<null> {
    return unwrap(this.agencyApiRepository.deleteCredential(provider));
  }

  generate(modality: Modality, payload: GenerateRequest): Observable<GenerateResponse> {
    const workerAddr = this.workerAddress.get();
    if (workerAddr && !payload.worker_addr) {
      payload = { ...payload, worker_addr: workerAddr };
    }
    return unwrap(this.agencyApiRepository.generate(modality, payload));
  }

  getStatus(modality: Modality, taskId: string): Observable<StatusResponse> {
    return unwrap(this.agencyApiRepository.getStatus(modality, taskId));
  }

  cancelTask(modality: Modality, taskId: string): Observable<null> {
    return unwrap(this.agencyApiRepository.cancelTask(modality, taskId));
  }

  preview(modality: Modality, payload: GenerateRequest): Observable<PreviewPayloadResponse> {
    return unwrap(this.agencyApiRepository.preview(modality, payload));
  }

  listGenerationLogs(filters: GenerationLogsFilters = {}): Observable<GenerationLogsPage> {
    return unwrap(this.agencyApiRepository.listGenerationLogs(filters));
  }

  getGenerationLog(id: string): Observable<GenerationLog> {
    return unwrap(this.agencyApiRepository.getGenerationLog(id));
  }

  getGenerationCostSummary(filters: GenerationLogsFilters = {}): Observable<CostSummary> {
    return unwrap(this.agencyApiRepository.getGenerationCostSummary(filters));
  }

  listServerCommunications(filters: ServerCommsFilters = {}): Observable<ServerCommsPage> {
    return unwrap(this.agencyApiRepository.listServerCommunications(filters));
  }

  getServerCommunication(id: string): Observable<ServerCommunication> {
    return unwrap(this.agencyApiRepository.getServerCommunication(id));
  }

  syncAsset(model: string, fileId: string): Observable<SyncAssetResult> {
    return unwrap(this.agencyApiRepository.syncAsset(model, fileId));
  }

  listSyncedAssets(model: string): Observable<ModelAsset[]> {
    return unwrap(this.agencyApiRepository.listSyncedAssets(model));
  }

  listGeneratedAssets(pieceId: string): Observable<GeneratedAsset[]> {
    return unwrap(this.agencyApiRepository.listGeneratedAssets(pieceId));
  }

  /** Extrae el texto de un folleto (PDF/DOCX/TXT/MD) para la descripción. */
  extractBrief(file: File): Observable<BriefExtraction> {
    return unwrap(this.agencyApiRepository.extractBrief(file));
  }

  /** Recent tasks of the authenticated user (take-reel hydration). */
  listRecentTasks(limit = 20): Observable<GenerationLog[]> {
    return unwrap(this.agencyApiRepository.listRecentTasks(limit));
  }

  /** Generaciones dentro de una ventana de fechas o de un proyecto. */
  taskHistory(params: {
    from?: string;
    to?: string;
    resource_type?: string;
    event_id?: string;
    limit?: number;
  }): Observable<GenerationLog[]> {
    return unwrap(this.agencyApiRepository.taskHistory(params));
  }

  /** Two-check rating ("Buena toma"/"Elegida final") of the caller's task. */
  updateTaskRating(taskId: string, good: boolean, final: boolean): Observable<null> {
    return unwrap(this.agencyApiRepository.updateTaskRating(taskId, good, final));
  }

  pollTaskUntilDone(
    modality: Modality,
    taskId: string,
    options: { intervalMs?: number; maxAttempts?: number } = {},
  ): Observable<StatusResponse> {
    const intervalMs = options.intervalMs ?? 3000;
    const maxAttempts = options.maxAttempts ?? 200;

    return timer(0, intervalMs).pipe(
      takeWhile((attempt) => attempt < maxAttempts),
      exhaustMap(() => this.getStatus(modality, taskId)),
      takeWhile((status) => !TERMINAL_STATUSES.includes(status.status), true),
    );
  }
}
