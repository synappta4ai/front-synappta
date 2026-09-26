import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { AuthState, initialAuthState } from '@interfaces/user.interface';
import { User } from '@modules/auth/interfaces';
import { StorageService, StorageServiceConfig, StorageType } from '@services/storage.service';
import { AUTH_STORAGE_KEY, DEFAULT_STORAGE_CONFIG } from '@constants/common';

let storageConfig: StorageServiceConfig = { ...DEFAULT_STORAGE_CONFIG };

export function setStorageConfig(config: {
  type: StorageType;
  dbName?: string;
  storeName?: string;
}): void {
  storageConfig = { ...DEFAULT_STORAGE_CONFIG, ...config };
}

export function getStorageConfig(): StorageServiceConfig {
  return { ...storageConfig };
}

async function loadFromStorage(storageService: StorageService): Promise<AuthState> {
  const saved = await storageService.getItem<AuthState>(AUTH_STORAGE_KEY, storageConfig);
  if (saved) {
    return {
      ...initialAuthState,
      ...saved,
      isAuthenticated: !!saved.token && !!saved.user,
      isHydrated: true,
      isHydrating: false,
    };
  }

  return { ...initialAuthState, isHydrated: true, isHydrating: false };
}

async function saveToStorage(state: AuthState, storageService: StorageService): Promise<void> {
  await storageService.setItem(AUTH_STORAGE_KEY, state, storageConfig);
}

async function removeFromStorage(storageService: StorageService): Promise<void> {
  await storageService.removeItem(AUTH_STORAGE_KEY, storageConfig);
}

export const UserSessionStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>(initialAuthState),
  withComputed((store) => ({
    currentUser: computed(() => store.user()),
    isLoggedIn: computed(() => store.isAuthenticated()),
    getToken: computed(() => store.token()),
    getRoles: computed(() => (store.user()?.role_name ? [store.user()!.role_name] : [])),
    getTenantId: computed(() => store.tenantId()),
    isHydrated: computed(() => store.isHydrated()),
    isHydrating: computed(() => store.isHydrating()),
  })),
  withMethods((store) => {
    const storageService = inject(StorageService);

    /** Promesa de la hidratación en curso (o completada). Evita lecturas duplicadas de IndexedDB. */
    let hydrationPromise: Promise<void> | null = null;

    function hydrate(): Promise<void> {
      if (!hydrationPromise) {
        hydrationPromise = (async () => {
          patchState(store, { isHydrating: true });
          const loadedState = await loadFromStorage(storageService);
          patchState(store, loadedState);
        })();
      }
      return hydrationPromise;
    }

    return {
      /** Restaura la sesión desde almacenamiento. Idempotente: solo lee una vez. */
      async init(): Promise<void> {
        await hydrate();
      },

      /** Resuelve cuando el store ya restauró la sesión (inmediato si ya terminó). */
      async waitUntilHydrated(): Promise<void> {
        await hydrate();
      },

      async login(user: User, token: string, tenantId: number): Promise<void> {
        const newState: AuthState = {
          user,
          token,
          tenantId,
          isAuthenticated: true,
          isLoading: false,
          isHydrated: true,
          isHydrating: false,
        };
        patchState(store, newState);
        await saveToStorage(newState, storageService);
      },

      async logout(): Promise<void> {
        patchState(store, { ...initialAuthState, isHydrated: true, isHydrating: false });
        await removeFromStorage(storageService);
      },

      setLoading(isLoading: boolean): void {
        patchState(store, { isLoading });
      },

      async updateToken(token: string): Promise<void> {
        const newState: AuthState = {
          user: store.user(),
          token,
          tenantId: store.tenantId(),
          isAuthenticated: !!token && !!store.user(),
          isLoading: store.isLoading(),
          isHydrated: true,
          isHydrating: false,
        };
        patchState(store, newState);
        await saveToStorage(newState, storageService);
      },

      async updateUser(user: Partial<User>): Promise<void> {
        const currentUser = store.user();
        if (currentUser) {
          const updatedUser = { ...currentUser, ...user };
          patchState(store, { user: updatedUser });
          await saveToStorage(
            {
              user: updatedUser,
              token: store.token(),
              tenantId: store.tenantId(),
              isAuthenticated: store.isAuthenticated(),
              isLoading: store.isLoading(),
              isHydrated: true,
              isHydrating: false,
            },
            storageService,
          );
        }
      },

      async syncState(): Promise<void> {
        const loadedState = await loadFromStorage(storageService);
        patchState(store, loadedState);
        hydrationPromise = Promise.resolve();
      },
    };
  }),
);
