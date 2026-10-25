import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';
import {
  AnalyzeVideoRequest,
  ComposeRequest,
  ComposeResponse,
  VideoAnalysis,
  VideoFormat,
} from '../interfaces';

interface PresetGroupRow {
  id: string;
  slug: string;
}

@Injectable({ providedIn: 'root' })
export class InfoproductApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  analyze(payload: AnalyzeVideoRequest): Observable<ApiResponse<VideoAnalysis>> {
    return this.http.post<ApiResponse<VideoAnalysis>>(`${this.apiUrl}/infoproduct/analyze`, payload);
  }

  compose(payload: ComposeRequest): Observable<ApiResponse<ComposeResponse>> {
    return this.http.post<ApiResponse<ComposeResponse>>(`${this.apiUrl}/infoproduct/compose`, payload);
  }

  listPresetGroups(): Observable<ApiResponse<PresetGroupRow[]>> {
    return this.http.get<ApiResponse<PresetGroupRow[]>>(`${this.apiUrl}/presets/groups`);
  }

  listPresetsByGroup(groupId: string): Observable<ApiResponse<VideoFormat[]>> {
    const params = new HttpParams().set('group_id', groupId);
    return this.http.get<ApiResponse<VideoFormat[]>>(`${this.apiUrl}/presets`, { params });
  }
}
