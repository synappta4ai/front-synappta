import { computed, inject, Injectable, signal } from '@angular/core';
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

function base64UrlToBase64(part: string): string {
  return part.replace(/-/g, '+').replace(/_/g, '/').padEnd((4 - (part.length % 4)) % 4, '=');
}

/** Valida que el token exista y sea un JWT no expirado (claim `exp`). */
function isTokenActive(token: string | null): boolean {
  if (!token || token.split('.').length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(atob(base64UrlToBase64(token.split('.')[1]))) as { exp?: unknown };
    if (typeof payload.exp !== 'number') {
      return true;
    }
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
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

@Injectable({ providedIn: 'root' })
export class UserSessionStore {
  private readonly storageService = inject(StorageService);

  private readonly _user = signal<User | null>(initialAuthState.user);
  private readonly _token = signal<string | null>(initialAuthState.token);
  private readonly _tenantId = signal<number | null>(initialAuthState.tenantId);
  private readonly _isAuthenticated = signal(initialAuthState.isAuthenticated);
  private readonly _isLoading = signal(initialAuthState.isLoading);
  private readonly _isHydrated = signal(initialAuthState.isHydrated);
  private readonly _isHydrating = signal(initialAuthState.isHydrating);

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly tenantId = this._tenantId.asReadonly();
  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly isHydrated = this._isHydrated.asReadonly();
  readonly isHydrating = this._isHydrating.asReadonly();

  readonly currentUser = computed(() => this.user());
  /** Hay sesión real: user cargado + token JWT presente y no expirado. */
  readonly isLoggedIn = computed(() => !!this.user() && isTokenActive(this.token()));
  readonly getToken = computed(() => this.token());
  readonly getRoles = computed(() => (this.user()?.role_name ? [this.user()!.role_name] : []));
  readonly getTenantId = computed(() => this.tenantId());

  /** Promesa de la hidratación en curso (o completada). Evita lecturas duplicadas de IndexedDB. */
  private hydrationPromise: Promise<void> | null = null;

  private hydrate(): Promise<void> {
    if (!this.hydrationPromise) {
      this.hydrationPromise = (async () => {
        this._isHydrating.set(true);
        const loadedState = await loadFromStorage(this.storageService);
        this.applyState(loadedState);
      })();
    }
    return this.hydrationPromise;
  }

  /** Restaura la sesión desde almacenamiento. Idempotente: solo lee una vez. */
  async init(): Promise<void> {
    await this.hydrate();
  }

  /** Resuelve cuando el store ya restauró la sesión (inmediato si ya terminó). */
  async waitUntilHydrated(): Promise<void> {
    await this.hydrate();
  }

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
    this.applyState(newState);
    await saveToStorage(newState, this.storageService);
  }

  async logout(): Promise<void> {
    this.applyState({ ...initialAuthState, isHydrated: true, isHydrating: false });
    await removeFromStorage(this.storageService);
  }

  setLoading(isLoading: boolean): void {
    this._isLoading.set(isLoading);
  }

  async updateToken(token: string): Promise<void> {
    const newState: AuthState = {
      user: this.user(),
      token,
      tenantId: this.tenantId(),
      isAuthenticated: !!token && !!this.user(),
      isLoading: this.isLoading(),
      isHydrated: true,
      isHydrating: false,
    };
    this.applyState(newState);
    await saveToStorage(newState, this.storageService);
  }

  async updateUser(user: Partial<User>): Promise<void> {
    const currentUser = this.user();
    if (currentUser) {
      const updatedUser = { ...currentUser, ...user };
      this._user.set(updatedUser);
      await saveToStorage(
        {
          user: updatedUser,
          token: this.token(),
          tenantId: this.tenantId(),
          isAuthenticated: this.isAuthenticated(),
          isLoading: this.isLoading(),
          isHydrated: true,
          isHydrating: false,
        },
        this.storageService,
      );
    }
  }

  async syncState(): Promise<void> {
    const loadedState = await loadFromStorage(this.storageService);
    this.applyState(loadedState);
    this.hydrationPromise = Promise.resolve();
  }

  private applyState(state: AuthState): void {
    this._user.set(state.user);
    this._token.set(state.token);
    this._tenantId.set(state.tenantId);
    this._isAuthenticated.set(state.isAuthenticated);
    this._isLoading.set(state.isLoading);
    this._isHydrated.set(state.isHydrated);
    this._isHydrating.set(state.isHydrating);
  }
}