import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

import { EditorClipInput } from '../interfaces';

const STORAGE_KEY = 'editor:inbox';

/**
 * Buzón entre las pantallas que envían material ("Enviar al editor") y el
 * editor. Vive en memoria y se respalda en sessionStorage para sobrevivir a una
 * recarga justo después de enviar. No modifica ningún store existente.
 */
@Injectable({ providedIn: 'root' })
export class EditorTransferService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private pending: EditorClipInput[] = [];

  send(clip: EditorClipInput): void {
    this.pending = [...this.pending, clip];
    this.persist();
  }

  /** Devuelve y vacía el material pendiente. */
  take(): EditorClipInput[] {
    const stored = this.read();
    const all = this.pending.length > 0 ? this.pending : stored;
    this.pending = [];
    this.persist();
    return all;
  }

  private read(): EditorClipInput[] {
    if (!this.isBrowser) {
      return [];
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as EditorClipInput[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      if (this.pending.length === 0) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.pending));
      }
    } catch {
      /* sessionStorage lleno o bloqueado: el buzón en memoria basta */
    }
  }
}
