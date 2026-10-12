import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEFAULT_STORAGE_CONFIG } from '@constants/common';

export interface AppState {
  isOnline: boolean;
  isLocalConnected: boolean;
  lastSyncTime: Date | null;
  isInitialized: boolean;
  isLoading: boolean;
  useOfflineApi: boolean;
}

export const initialAppState: AppState = {
  isOnline: true,
  isLocalConnected: false,
  lastSyncTime: null,
  isInitialized: false,
  isLoading: false,
  useOfflineApi: false,
};

const STORAGE_KEY = 'app-state';

function getStoredState(platformId: unknown): Partial<AppState> | null {
  if (!isPlatformBrowser(platformId as Object)) {
    return null;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        lastSyncTime: parsed.lastSyncTime ? new Date(parsed.lastSyncTime) : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function saveState(platformId: unknown, state: Partial<AppState>): void {
  if (!isPlatformBrowser(platformId as Object)) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _isOnline = signal(initialAppState.isOnline);
  private readonly _isLocalConnected = signal(initialAppState.isLocalConnected);
  private readonly _lastSyncTime = signal<Date | null>(initialAppState.lastSyncTime);
  private readonly _isInitialized = signal(initialAppState.isInitialized);
  private readonly _isLoading = signal(initialAppState.isLoading);
  private readonly _useOfflineApi = signal(initialAppState.useOfflineApi);

  readonly isOnline = this._isOnline.asReadonly();
  readonly isLocalConnected = this._isLocalConnected.asReadonly();
  readonly lastSyncTime = this._lastSyncTime.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly useOfflineApi = this._useOfflineApi.asReadonly();

  readonly isReady = computed(() => this.isInitialized() && !this.isLoading());
  readonly hasConnection = computed(() => this.isOnline() || this.isLocalConnected());

  private networkListenerSetup = false;
  private dbCheckInterval: ReturnType<typeof setInterval> | null = null;

  private setupNetworkListener(): void {
    if (this.networkListenerSetup || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.networkListenerSetup = true;

    const updateOnlineStatus = (): void => {
      this._isOnline.set(navigator.onLine);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    updateOnlineStatus();
  }

  private startDbConnectionCheck(): void {
    if (this.dbCheckInterval || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.dbCheckInterval = setInterval(() => {
      void this.checkLocalConnection();
    }, 5000);
  }

  private stopDbConnectionCheck(): void {
    if (this.dbCheckInterval) {
      clearInterval(this.dbCheckInterval);
      this.dbCheckInterval = null;
    }
  }

  private checkLocalConnection(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      this._isLocalConnected.set(false);
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DEFAULT_STORAGE_CONFIG.dbName ?? 'Synapta-V2');

        request.onerror = () => {
          this._isLocalConnected.set(false);
          resolve(false);
        };

        request.onsuccess = () => {
          this._isLocalConnected.set(true);
          request.result?.close();
          resolve(true);
        };
      } catch {
        this._isLocalConnected.set(false);
        resolve(false);
      }
    });
  }

  async init(): Promise<void> {
    this._isLoading.set(true);

    this.setupNetworkListener();

    await this.checkLocalConnection();

    const stored = getStoredState(this.platformId);
    if (stored) {
      this._lastSyncTime.set(stored.lastSyncTime ?? null);
    }

    this._isInitialized.set(true);
    this._isLoading.set(false);

    this.startDbConnectionCheck();

    this.persist();
  }

  async setOnlineStatus(isOnline: boolean): Promise<void> {
    this._isOnline.set(isOnline);
    this.persist();
  }

  async setLocalConnected(isLocalConnected: boolean): Promise<void> {
    this._isLocalConnected.set(isLocalConnected);
    this.persist();
  }

  async syncNow(): Promise<void> {
    this._lastSyncTime.set(new Date());
    this.persist();
  }

  setLoading(isLoading: boolean): void {
    this._isLoading.set(isLoading);
  }

  destroy(): void {
    this.stopDbConnectionCheck();
    this.networkListenerSetup = false;
  }

  private persist(): void {
    saveState(this.platformId, {
      isOnline: this.isOnline(),
      isLocalConnected: this.isLocalConnected(),
      lastSyncTime: this.lastSyncTime(),
      isInitialized: this.isInitialized(),
      isLoading: this.isLoading(),
    });
  }
}