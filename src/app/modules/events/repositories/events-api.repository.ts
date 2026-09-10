import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  CreateEventRequest,
  CreateGenerationRequest,
  CreatePieceRequest,
  CreateProgramRequest,
  Event,
  EventWithPrograms,
  Piece,
  PieceGeneration,
  Program,
  UpdateEventRequest,
  UpdateGenerationRequest,
  UpdatePieceRequest,
  UpdateProgramRequest,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class EventsApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listEvents(all = false): Observable<ApiResponse<Event[]>> {
    const params = new HttpParams().set('all', String(all));
    return this.http.get<ApiResponse<Event[]>>(`${this.apiUrl}/events`, { params });
  }

  getEvent(id: string): Observable<ApiResponse<EventWithPrograms>> {
    return this.http.get<ApiResponse<EventWithPrograms>>(`${this.apiUrl}/events/${id}`);
  }

  createEvent(payload: CreateEventRequest): Observable<ApiResponse<Event>> {
    return this.http.post<ApiResponse<Event>>(`${this.apiUrl}/events`, payload);
  }

  updateEvent(id: string, payload: UpdateEventRequest): Observable<ApiResponse<Event>> {
    return this.http.patch<ApiResponse<Event>>(`${this.apiUrl}/events/${id}`, payload);
  }

  deleteEvent(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/events/${id}`);
  }

  listPrograms(eventId: string): Observable<ApiResponse<Program[]>> {
    return this.http.get<ApiResponse<Program[]>>(`${this.apiUrl}/events/${eventId}/programs`);
  }

  createProgram(eventId: string, payload: CreateProgramRequest): Observable<ApiResponse<Program>> {
    return this.http.post<ApiResponse<Program>>(
      `${this.apiUrl}/events/${eventId}/programs`,
      payload,
    );
  }

  updateProgram(id: string, payload: UpdateProgramRequest): Observable<ApiResponse<Program>> {
    return this.http.patch<ApiResponse<Program>>(`${this.apiUrl}/programs/${id}`, payload);
  }

  deleteProgram(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/programs/${id}`);
  }

  listPieces(
    filters: { event_id?: string; program_id?: string } = {},
  ): Observable<ApiResponse<Piece[]>> {
    let params = new HttpParams();
    if (filters.event_id) {
      params = params.set('event_id', filters.event_id);
    }
    if (filters.program_id) {
      params = params.set('program_id', filters.program_id);
    }
    return this.http.get<ApiResponse<Piece[]>>(`${this.apiUrl}/pieces`, { params });
  }

  getPiece(id: string): Observable<ApiResponse<Piece>> {
    return this.http.get<ApiResponse<Piece>>(`${this.apiUrl}/pieces/${id}`);
  }

  createPiece(payload: CreatePieceRequest): Observable<ApiResponse<Piece>> {
    return this.http.post<ApiResponse<Piece>>(`${this.apiUrl}/pieces`, payload);
  }

  updatePiece(id: string, payload: UpdatePieceRequest): Observable<ApiResponse<Piece>> {
    return this.http.patch<ApiResponse<Piece>>(`${this.apiUrl}/pieces/${id}`, payload);
  }

  deletePiece(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/pieces/${id}`);
  }

  listGenerations(pieceId: string): Observable<ApiResponse<PieceGeneration[]>> {
    return this.http.get<ApiResponse<PieceGeneration[]>>(
      `${this.apiUrl}/pieces/${pieceId}/generations`,
    );
  }

  createGeneration(
    pieceId: string,
    payload: CreateGenerationRequest,
  ): Observable<ApiResponse<PieceGeneration>> {
    return this.http.post<ApiResponse<PieceGeneration>>(
      `${this.apiUrl}/pieces/${pieceId}/generations`,
      payload,
    );
  }

  getGeneration(id: string): Observable<ApiResponse<PieceGeneration>> {
    return this.http.get<ApiResponse<PieceGeneration>>(`${this.apiUrl}/generations/${id}`);
  }

  updateGeneration(
    id: string,
    payload: UpdateGenerationRequest,
  ): Observable<ApiResponse<PieceGeneration>> {
    return this.http.patch<ApiResponse<PieceGeneration>>(
      `${this.apiUrl}/generations/${id}`,
      payload,
    );
  }

  deleteGeneration(id: string): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/generations/${id}`);
  }
}
