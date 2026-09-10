import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { STORAGE_KEYS } from '@constants/storage.constants';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly document = inject(DOCUMENT);

  getToken(): string | null {
    return this.safeGet(STORAGE_KEYS.token);
  }

  saveSession(token: string, user: unknown): void {
    this.safeSet(STORAGE_KEYS.token, token);
    if (user !== null && user !== undefined) {
      this.safeSet(STORAGE_KEYS.user, JSON.stringify(user));
    }
  }

  getUser<T>(): T | null {
    const raw = this.safeGet(STORAGE_KEYS.user);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.safeRemove(STORAGE_KEYS.token);
    this.safeRemove(STORAGE_KEYS.user);
  }

  private safeGet(key: string): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private safeSet(key: string, value: string): void {
    try {
      this.document.defaultView?.localStorage.setItem(key, value);
    } catch {
      // Storage unavailable (SSR or privacy mode): session stays memory-only.
    }
  }

  private safeRemove(key: string): void {
    try {
      this.document.defaultView?.localStorage.removeItem(key);
    } catch {
      // No-op.
    }
  }
}
