import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

export type AssignableType =
  'event' | 'program' | 'piece' | 'ingredient' | 'file' | 'preset' | 'skill' | 'model';

export interface Assignment {
  id: string;
  target_type: AssignableType;
  target_id: string;
  resource_type: AssignableType;
  resource_id: string;
  created_at: string;
}

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AssignmentsApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listByTarget(
    targetType: AssignableType,
    targetId: string,
  ): Observable<ApiResponse<Assignment[]>> {
    return this.http.get<ApiResponse<Assignment[]>>(
      `${this.apiUrl}/assignments/${targetType}/${targetId}`,
    );
  }

  listByResource(
    resourceType: AssignableType,
    resourceId: string,
  ): Observable<ApiResponse<Assignment[]>> {
    return this.http.get<ApiResponse<Assignment[]>>(
      `${this.apiUrl}/assignments/resource/${resourceType}/${resourceId}`,
    );
  }

  assign(
    targetType: AssignableType,
    targetId: string,
    resourceType: AssignableType,
    resourceId: string,
  ): Observable<ApiResponse<Assignment>> {
    return this.http.post<ApiResponse<Assignment>>(
      `${this.apiUrl}/assignments/${targetType}/${targetId}`,
      { resource_type: resourceType, resource_id: resourceId },
    );
  }

  unassign(
    targetType: AssignableType,
    targetId: string,
    resourceType: AssignableType,
    resourceId: string,
  ): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(
      `${this.apiUrl}/assignments/${targetType}/${targetId}/${resourceType}/${resourceId}`,
    );
  }

  deleteById(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/assignments/by-id/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PushApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  subscribe(payload: PushSubscriptionRequest): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/push/subscriptions`, payload);
  }

  unsubscribe(payload: PushSubscriptionRequest): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/push/subscriptions`, {
      body: payload,
    });
  }

  sendTest(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/push/test`, {});
  }
}
