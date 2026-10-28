import { inject, Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, throwError } from 'rxjs';

import { AiModel, Modality } from '../interfaces';
import { AgencyService } from './agency.service';

/**
 * Catálogo de modelos por modalidad, memoriado para la sesión.
 *
 * El back ya filtra lo que el tenant puede correr (credenciales cargadas y
 * workers disponibles), así que esto sólo evita repetir la misma petición:
 * varias pantallas —o varios selectores en la misma pantalla— comparten una
 * sola llamada por modalidad. La memoria se invalida a mano con `refresh()`
 * cuando cambian las credenciales del tenant.
 */
@Injectable({ providedIn: 'root' })
export class ModelCatalogService {
  private readonly agencyService = inject(AgencyService);
  /** Una entrada por modalidad; guarda la petición, no sólo el resultado. */
  private readonly requests = new Map<Modality, Observable<AiModel[]>>();
  /** Catálogo completo (GET /models), misma memoización que por modalidad. */
  private allRequest: Observable<AiModel[]> | null = null;

  /** Modelos de una modalidad (texto, voz, imagen o video). */
  byModality(modality: Modality): Observable<AiModel[]> {
    const cached = this.requests.get(modality);
    if (cached) {
      return cached;
    }
    const request = this.agencyService.listModelsByModality(modality).pipe(
      // Un error no se memoriza: la próxima suscripción reintenta.
      catchError((err: unknown) => {
        this.requests.delete(modality);
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.requests.set(modality, request);
    return request;
  }

  /**
   * Varias modalidades para un mismo selector (p. ej. imagen + video). Cada
   * una usa su propia entrada memoriada y se concatenan en el orden pedido.
   */
  byModalities(modalities: readonly Modality[]): Observable<AiModel[]> {
    const unique = [...new Set(modalities)];
    if (unique.length === 0) {
      return of([]);
    }
    if (unique.length === 1) {
      return this.byModality(unique[0]!);
    }
    return forkJoin(unique.map((modality) => this.byModality(modality))).pipe(
      map((lists) => lists.flat()),
    );
  }

  /**
   * Catálogo completo sin filtrar (el mismo GET /models del Studio).
   * Punto único de lectura para pantallas que necesitan los objetos enteros
   * (payloads, defaults, badges): Agency y Studio lo mapean a su forma.
   */
  all(): Observable<AiModel[]> {
    if (!this.allRequest) {
      this.allRequest = this.agencyService.listModels().pipe(
        catchError((err: unknown) => {
          this.allRequest = null;
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.allRequest;
  }

  /** Olvida lo memorizado (todo, o sólo una modalidad) para volver a pedirlo. */
  refresh(modality?: Modality): void {
    if (modality) {
      this.requests.delete(modality);
      return;
    }
    this.requests.clear();
    this.allRequest = null;
  }
}
