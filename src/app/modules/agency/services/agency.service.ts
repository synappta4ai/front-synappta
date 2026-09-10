import { inject, Injectable } from '@angular/core';
import { Observable, timer } from 'rxjs';
import { exhaustMap, takeWhile } from 'rxjs/operators';

import {
  AiModel,
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

const TERMINAL_STATUSES: readonly string[] = ['succeeded', 'failed', 'cancelled'];

@Injectable({ providedIn: 'root' })
export class AgencyService {
  private readonly agencyApiRepository = inject(AgencyApiRepository);

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

function unwrap<T>(source: Observable<{ data: T | null; message: string }>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        if (response.data === null) {
          subscriber.error(new Error(response.message || 'Unexpected empty response'));
          return;
        }
        subscriber.next(response.data);
        subscriber.complete();
      },
      error: (err: unknown) => subscriber.error(err),
    });
    return () => subscription.unsubscribe();
  });
}
