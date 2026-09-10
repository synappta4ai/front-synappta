import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';
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

@Injectable({ providedIn: 'root' })
export class AgencyApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listModels(): Observable<ApiResponse<AiModel[]>> {
    return this.http.get<ApiResponse<AiModel[]>>(`${this.apiUrl}/models`);
  }

  listModelsByModality(modality: Modality): Observable<ApiResponse<AiModel[]>> {
    return this.http.get<ApiResponse<AiModel[]>>(`${this.apiUrl}/models/${modality}`);
  }

  listCredentials(): Observable<ApiResponse<Credential[]>> {
    return this.http.get<ApiResponse<Credential[]>>(`${this.apiUrl}/credentials`);
  }

  upsertCredential(payload: UpsertCredentialRequest): Observable<ApiResponse<null>> {
    return this.http.put<ApiResponse<null>>(`${this.apiUrl}/credentials`, payload);
  }

  deleteCredential(provider: Credential['provider']): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/credentials/${provider}`);
  }

  generate(
    modality: Modality,
    payload: GenerateRequest,
  ): Observable<ApiResponse<GenerateResponse>> {
    return this.http.post<ApiResponse<GenerateResponse>>(
      `${this.apiUrl}/agency/${modality}/generate`,
      payload,
    );
  }

  getStatus(modality: Modality, taskId: string): Observable<ApiResponse<StatusResponse>> {
    return this.http.get<ApiResponse<StatusResponse>>(
      `${this.apiUrl}/agency/${modality}/status/${taskId}`,
    );
  }

  cancelTask(modality: Modality, taskId: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/agency/${modality}/task/${taskId}`);
  }

  preview(
    modality: Modality,
    payload: GenerateRequest,
  ): Observable<ApiResponse<PreviewPayloadResponse>> {
    return this.http.post<ApiResponse<PreviewPayloadResponse>>(
      `${this.apiUrl}/agency/${modality}/preview`,
      payload,
    );
  }

  listGenerationLogs(
    filters: GenerationLogsFilters = {},
  ): Observable<ApiResponse<GenerationLogsPage>> {
    const params = toQueryParams(filters);
    return this.http.get<ApiResponse<GenerationLogsPage>>(`${this.apiUrl}/agency/logs/generation`, {
      params,
    });
  }

  getGenerationLog(id: string): Observable<ApiResponse<GenerationLog>> {
    return this.http.get<ApiResponse<GenerationLog>>(`${this.apiUrl}/agency/logs/generation/${id}`);
  }

  getGenerationCostSummary(
    filters: GenerationLogsFilters = {},
  ): Observable<ApiResponse<CostSummary>> {
    const params = toQueryParams(filters);
    return this.http.get<ApiResponse<CostSummary>>(
      `${this.apiUrl}/agency/logs/generation/cost-summary`,
      { params },
    );
  }

  listServerCommunications(
    filters: ServerCommsFilters = {},
  ): Observable<ApiResponse<ServerCommsPage>> {
    const params = toQueryParams(filters);
    return this.http.get<ApiResponse<ServerCommsPage>>(
      `${this.apiUrl}/agency/logs/server-communications`,
      { params },
    );
  }

  getServerCommunication(id: string): Observable<ApiResponse<ServerCommunication>> {
    return this.http.get<ApiResponse<ServerCommunication>>(
      `${this.apiUrl}/agency/logs/server-communications/${id}`,
    );
  }

  syncAsset(model: string, fileId: string): Observable<ApiResponse<SyncAssetResult>> {
    return this.http.post<ApiResponse<SyncAssetResult>>(`${this.apiUrl}/agency/sync-asset`, {
      model,
      file_id: fileId,
    });
  }

  listSyncedAssets(model: string): Observable<ApiResponse<ModelAsset[]>> {
    const params = toQueryParams({ model });
    return this.http.get<ApiResponse<ModelAsset[]>>(`${this.apiUrl}/agency/synced-assets`, {
      params,
    });
  }

  listGeneratedAssets(pieceId: string): Observable<ApiResponse<GeneratedAsset[]>> {
    const params = toQueryParams({ piece_id: pieceId });
    return this.http.get<ApiResponse<GeneratedAsset[]>>(`${this.apiUrl}/agency/assets`, { params });
  }
}

function toQueryParams(
  filters: GenerationLogsFilters | ServerCommsFilters | Record<string, string | number | undefined>,
): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
