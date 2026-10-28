import { Injectable } from '@angular/core';

const STORAGE_KEY = 'synapta_worker_addr';

/**
 * Guarda y lee la dirección del inference worker del usuario (Option B).
 * Cada usuario puede tener su propio worker local; no hay una IP quemada en
 * el back. El valor se persiste en localStorage y se inyecta en cada payload
 * de generación (POST /agency/:modality/generate).
 */
@Injectable({ providedIn: 'root' })
export class WorkerAddressService {
  get(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY) || null;
  }

  set(addr: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, addr.trim());
  }

  clear(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }
}
