import { inject, Injectable, signal } from '@angular/core';

import { LocalStorageService } from './local-storage.service';

/** Insumo (imagen, video o audio) que viaja con un clip de la cola. */
export interface QueueAsset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio';
}

/**
 * Un clip listo para generar: prompt final con tags, insumos y configuración.
 * Lo arma cualquier flujo (VideoMachine, Infoproducto, Writing Copilot...) y el
 * Estudio lo lanza a demanda desde la cola.
 */
export interface QueueItem {
  id: string;
  /** Nombre visible en la cola (por ejemplo "Escena 1 · video 1"). */
  label: string;
  /** Agente que lo generó (comercial, cine, infoproducto, writing_copilot...). */
  source: string;
  /** Prompt final (con tags @). */
  prompt: string;
  assets: QueueAsset[];
  model: string;
  modelDisplayName: string;
  ratio: string;
  duration: number;
  resolution: string;
  generateAudio: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'synapta.generation-queue';

/**
 * Cola de clips pendientes de generar, compartida por todos los flujos.
 * Vive en el navegador (localStorage) para sobrevivir a la navegación entre
 * módulos; el Estudio la muestra colapsable por clip.
 */
@Injectable({ providedIn: 'root' })
export class GenerationQueueService {
  private readonly storage = inject(LocalStorageService);
  private readonly state = signal<readonly QueueItem[]>(this.restore());

  readonly items = this.state.asReadonly();

  /** Encola clips nuevos (los más recientes primero). */
  add(items: readonly Omit<QueueItem, 'id' | 'createdAt'>[]): void {
    if (items.length === 0) return;
    const now = new Date().toISOString();
    const created = items.map((item) => ({
      ...item,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
    }));
    this.commit([...created, ...this.state()]);
  }

  remove(id: string): void {
    this.commit(this.state().filter((item) => item.id !== id));
  }

  clear(): void {
    this.commit([]);
  }

  private commit(items: readonly QueueItem[]): void {
    this.state.set(items);
    this.persist(items);
  }

  private restore(): readonly QueueItem[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
    } catch {
      return [];
    }
  }

  private persist(items: readonly QueueItem[]): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Sin almacenamiento disponible: la cola sigue en memoria.
    }
  }
}
