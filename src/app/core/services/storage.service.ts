import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type StorageType = 'localStorage' | 'indexedDB';

export interface StorageServiceConfig {
  type: StorageType;
  dbName?: string;
  storeName?: string;
}

/////////////////////////////////////////////////////////////////////
////////////////// APOYO PARA LA CREACION DE STORE //////////////////
/////////////////////////////////////////////////////////////////////

/**
 * Servicio para manejar el almacenamiento local del navegador.
 * Utiliza la API `IndexedDB` por defecto para almacenar datos en el navegador.
 */
@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private platformId = inject(PLATFORM_ID);
  private db: IDBDatabase | null = null;
  private dbConfig: StorageServiceConfig | null = null;
  private initPromise: Promise<void> | null = null;

  private async initIndexedDB(config: StorageServiceConfig): Promise<void> {
    if (this.db && this.dbConfig?.dbName === config.dbName) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(config.dbName || 'aura-pos-db', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(config.storeName || 'synapta-store')) {
          db.createObjectStore(config.storeName || 'synapta-store', { keyPath: 'key' });
        }
      };
    });
  }

  async getItem<T>(key: string, config: StorageServiceConfig): Promise<T | null> {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    if (config.type === 'localStorage') {
      const item = localStorage.getItem(key);
      if (!item) return null;
      try {
        return JSON.parse(item) as T;
      } catch {
        return null;
      }
    }

    await this.ensureDB(config);
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([config.storeName || 'synapta-store'], 'readonly');
      const store = transaction.objectStore(config.storeName || 'synapta-store');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value ?? null);
      };

      request.onerror = () => resolve(null);
    });
  }

  async setItem<T>(key: string, value: T, config: StorageServiceConfig): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (config.type === 'localStorage') {
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }

    await this.ensureDB(config);
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([config.storeName || 'synapta-store'], 'readwrite');
      const store = transaction.objectStore(config.storeName || 'synapta-store');
      store.put({ key, value });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  async removeItem(key: string, config: StorageServiceConfig): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (config.type === 'localStorage') {
      localStorage.removeItem(key);
      return;
    }

    await this.ensureDB(config);
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([config.storeName || 'synapta-store'], 'readwrite');
      const store = transaction.objectStore(config.storeName || 'synapta-store');
      store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  private async ensureDB(config: StorageServiceConfig): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initIndexedDB(config).catch(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  clearAll(config: StorageServiceConfig): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (config.type === 'localStorage') {
      localStorage.clear();
      return;
    }

    if (this.db) {
      const transaction = this.db.transaction([config.storeName || 'synapta-store'], 'readwrite');
      const store = transaction.objectStore(config.storeName || 'synapta-store');
      store.clear();
    }
  }
}
