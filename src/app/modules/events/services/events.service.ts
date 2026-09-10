import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
import { EventsApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly eventsApiRepository = inject(EventsApiRepository);

  listEvents(all = false): Observable<Event[]> {
    return unwrap(this.eventsApiRepository.listEvents(all));
  }

  getEvent(id: string): Observable<EventWithPrograms> {
    return unwrap(this.eventsApiRepository.getEvent(id));
  }

  createEvent(payload: CreateEventRequest): Observable<Event> {
    return unwrap(this.eventsApiRepository.createEvent(payload));
  }

  updateEvent(id: string, payload: UpdateEventRequest): Observable<Event> {
    return unwrap(this.eventsApiRepository.updateEvent(id, payload));
  }

  deleteEvent(id: string): Observable<null> {
    return unwrap(this.eventsApiRepository.deleteEvent(id));
  }

  listPrograms(eventId: string): Observable<Program[]> {
    return unwrap(this.eventsApiRepository.listPrograms(eventId));
  }

  createProgram(eventId: string, payload: CreateProgramRequest): Observable<Program> {
    return unwrap(this.eventsApiRepository.createProgram(eventId, payload));
  }

  updateProgram(id: string, payload: UpdateProgramRequest): Observable<Program> {
    return unwrap(this.eventsApiRepository.updateProgram(id, payload));
  }

  deleteProgram(id: string): Observable<null> {
    return unwrap(this.eventsApiRepository.deleteProgram(id));
  }

  listPieces(filters: { event_id?: string; program_id?: string } = {}): Observable<Piece[]> {
    return unwrap(this.eventsApiRepository.listPieces(filters));
  }

  getPiece(id: string): Observable<Piece> {
    return unwrap(this.eventsApiRepository.getPiece(id));
  }

  createPiece(payload: CreatePieceRequest): Observable<Piece> {
    return unwrap(this.eventsApiRepository.createPiece(payload));
  }

  updatePiece(id: string, payload: UpdatePieceRequest): Observable<Piece> {
    return unwrap(this.eventsApiRepository.updatePiece(id, payload));
  }

  deletePiece(id: string): Observable<null> {
    return unwrap(this.eventsApiRepository.deletePiece(id));
  }

  listGenerations(pieceId: string): Observable<PieceGeneration[]> {
    return unwrap(this.eventsApiRepository.listGenerations(pieceId));
  }

  createGeneration(pieceId: string, payload: CreateGenerationRequest): Observable<PieceGeneration> {
    return unwrap(this.eventsApiRepository.createGeneration(pieceId, payload));
  }

  getGeneration(id: string): Observable<PieceGeneration> {
    return unwrap(this.eventsApiRepository.getGeneration(id));
  }

  updateGeneration(id: string, payload: UpdateGenerationRequest): Observable<PieceGeneration> {
    return unwrap(this.eventsApiRepository.updateGeneration(id, payload));
  }

  deleteGeneration(id: string): Observable<null> {
    return unwrap(this.eventsApiRepository.deleteGeneration(id));
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
