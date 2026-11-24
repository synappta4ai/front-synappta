import { Injectable, signal } from '@angular/core';

import type { DispatchOrigin } from '../interfaces';

/** El historial lista generation_logs, que no guardan el despacho: lo visto en
 *  el status se conserva entre recargas para no perderlo al refrescar. */
const STORAGE_KEY = 'synapta.generation.dispatch';
/** Tope de entradas retenidas (se descartan las más viejas). */
const MAX_ENTRIES = 400;

/**
 * Registro `task_id → dispatch`: por dónde salió cada generación.
 *
 * La única fuente es la respuesta de status del back (`dispatch`), que la
 * informa el generador de modelos descargados: `bridge` = la GPU propia del
 * tenant tomó el job, `central` = worker de inferencia central. Los listados
 * que no encuestan (el historial) lo consultan por task id.
 */
@Injectable({ providedIn: 'root' })
export class TaskDispatchService {
  private readonly origins = signal<Record<string, DispatchOrigin>>(readStored());

  /** Guarda el despacho que informó el status de esa tarea. */
  record(taskId: string | null | undefined, dispatch: unknown): void {
    if (!taskId) {
      return;
    }
    const origin = toOrigin(dispatch);
    if (!origin || this.origins()[taskId] === origin) {
      return;
    }
    this.origins.set(trim({ ...this.origins(), [taskId]: origin }));
    persist(this.origins());
  }

  /** Despacho conocido de una tarea (null si todavía no hubo status). */
  origin(taskId: string | null | undefined): DispatchOrigin | null {
    if (!taskId) {
      return null;
    }
    return this.origins()[taskId] ?? null;
  }
}

/** Normaliza el `dispatch` del status a un origen mostrable. */
export function toOrigin(value: unknown): DispatchOrigin | null {
  return value === 'bridge' || value === 'central' ? value : null;
}

function trim(map: Record<string, DispatchOrigin>): Record<string, DispatchOrigin> {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) {
    return map;
  }
  const keep = keys.slice(keys.length - MAX_ENTRIES);
  return Object.fromEntries(keep.map((key) => [key, map[key]]));
}

function readStored(): Record<string, DispatchOrigin> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: Record<string, DispatchOrigin> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const origin = toOrigin(value);
      if (origin) {
        out[key] = origin;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: Record<string, DispatchOrigin>): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Cuota llena o modo privado: el registro sigue viviendo en memoria.
  }
}
