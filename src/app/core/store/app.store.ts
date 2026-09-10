import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { computed, inject, PLATFORM_ID } from '@angular/core';
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

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState<AppState>(initialAppState),
  withComputed((store) => ({
    isReady: computed(() => store.isInitialized() && !store.isLoading()),
    hasConnection: computed(() => store.isOnline() || store.isLocalConnected()),
  })),
  withMethods((store) => {
    const platformId = inject(PLATFORM_ID);
    let networkListenerSetup = false;
    let dbCheckInterval: ReturnType<typeof setInterval> | null = null;

    function setupNetworkListener(): void {
      if (networkListenerSetup || !platformId || !isPlatformBrowser(platformId)) {
        return;
      }

      networkListenerSetup = true;

      const updateOnlineStatus = (): void => {
        const isOnline = navigator.onLine;
        patchState(store, { isOnline });
      };

      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      updateOnlineStatus();
    }

    function startDbConnectionCheck(): void {
      if (dbCheckInterval || !platformId || !isPlatformBrowser(platformId)) {
        return;
      }

      dbCheckInterval = setInterval(() => {
        checkLocalConnection();
      }, 5000);
    }

    function stopDbConnectionCheck(): void {
      if (dbCheckInterval) {
        clearInterval(dbCheckInterval);
        dbCheckInterval = null;
      }
    }

    async function checkLocalConnection(): Promise<boolean> {
      if (!platformId || !isPlatformBrowser(platformId)) {
        patchState(store, { isLocalConnected: false });
        return false;
      }

      return new Promise((resolve) => {
        try {
          const request = indexedDB.open(DEFAULT_STORAGE_CONFIG.dbName ?? 'Synapta-V2');

          request.onerror = () => {
            patchState(store, { isLocalConnected: false });
            resolve(false);
          };

          request.onsuccess = () => {
            patchState(store, { isLocalConnected: true });
            request.result?.close();
            resolve(true);
          };
        } catch {
          patchState(store, { isLocalConnected: false });
          resolve(false);
        }
      });
    }

    return {
      async init(): Promise<void> {
        patchState(store, { isLoading: true });

        setupNetworkListener();

        await checkLocalConnection();

        const stored = getStoredState(platformId);
        if (stored) {
          patchState(store, {
            lastSyncTime: stored.lastSyncTime ?? null,
          });
        }

        patchState(store, { isInitialized: true, isLoading: false });

        startDbConnectionCheck();

        saveState(platformId, {
          isOnline: store.isOnline(),
          isLocalConnected: store.isLocalConnected(),
          lastSyncTime: store.lastSyncTime(),
          isInitialized: store.isInitialized(),
          isLoading: store.isLoading(),
        });
      },
      async setOnlineStatus(isOnline: boolean): Promise<void> {
        patchState(store, { isOnline });
        if (platformId) {
          saveState(platformId, {
            isOnline: store.isOnline(),
            isLocalConnected: store.isLocalConnected(),
            lastSyncTime: store.lastSyncTime(),
            isInitialized: store.isInitialized(),
            isLoading: store.isLoading(),
          });
        }
      },

      async setLocalConnected(isLocalConnected: boolean): Promise<void> {
        patchState(store, { isLocalConnected });
        if (platformId) {
          saveState(platformId, {
            isOnline: store.isOnline(),
            isLocalConnected: store.isLocalConnected(),
            lastSyncTime: store.lastSyncTime(),
            isInitialized: store.isInitialized(),
            isLoading: store.isLoading(),
          });
        }
      },

      async syncNow(): Promise<void> {
        patchState(store, { lastSyncTime: new Date() });
        if (platformId) {
          saveState(platformId, {
            isOnline: store.isOnline(),
            isLocalConnected: store.isLocalConnected(),
            lastSyncTime: store.lastSyncTime(),
            isInitialized: store.isInitialized(),
            isLoading: store.isLoading(),
          });
        }
      },

      setLoading(isLoading: boolean): void {
        patchState(store, { isLoading });
      },

      destroy(): void {
        stopDbConnectionCheck();
        networkListenerSetup = false;
      },
    };
  }),
);
