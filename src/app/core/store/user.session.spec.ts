import { TestBed } from '@angular/core/testing';

import { UserSessionStore, setStorageConfig } from './user.session';
import { StorageService } from '@services/storage.service';
import { AUTH_STORAGE_KEY } from '@constants/common';
import { User } from '@modules/auth/interfaces';

function jwt(exp: number): string {
  const encode = (value: string): string =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode('{"alg":"HS256","typ":"JWT"}')}.${encode(JSON.stringify({ sub: 1, exp }))}.signature`;
}

function mockLocalStorage(): void {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) {
          delete store[key];
        }
      },
    },
    writable: true,
  });
}

const user: User = {
  id: 1,
  username: 'drako',
  name: 'Drako',
  surname: '',
  user_name: 'drako',
  email: 'drako@synapta.app',
  role_level: 3,
  role_name: 'USER',
  active: true,
};

describe('UserSessionStore', () => {
  let store: UserSessionStore;
  let storage: StorageService;

  beforeEach(async () => {
    setStorageConfig({ type: 'localStorage' });
    mockLocalStorage();

    await TestBed.configureTestingModule({
      providers: [StorageService, UserSessionStore],
    }).compileComponents();

    store = TestBed.inject(UserSessionStore);
    storage = TestBed.inject(StorageService);

    await store.logout();
  });

  it('starts not logged in', () => {
    expect(store.isLoggedIn()).toBe(false);
    expect(store.currentUser()).toBeNull();
    expect(store.token()).toBeNull();
  });

  it('logs in with an active JWT', async () => {
    await store.login(user, jwt(Math.floor(Date.now() / 1000) + 3600), 1);

    expect(store.isLoggedIn()).toBe(true);
    expect(store.currentUser()).toEqual(user);
    expect(store.getToken()).not.toBeNull();
    expect(store.getTenantId()).toBe(1);
  });

  it('does not count an expired JWT as an active session', async () => {
    await store.login(user, jwt(Math.floor(Date.now() / 1000) - 3600), 1);

    expect(store.isLoggedIn()).toBe(false);
  });

  it('does not count a non-JWT token as an active session', async () => {
    await store.login(user, 'jwt-123', 1);

    expect(store.isLoggedIn()).toBe(false);
  });

  it('is not logged in without a user even with a valid token', async () => {
    await store.updateToken(jwt(Math.floor(Date.now() / 1000) + 3600));

    expect(store.token()).not.toBeNull();
    expect(store.isLoggedIn()).toBe(false);
  });

  it('logs out and clears the persisted session', async () => {
    await store.login(user, jwt(Math.floor(Date.now() / 1000) + 3600), 1);
    expect(store.isLoggedIn()).toBe(true);

    await store.logout();

    expect(store.isLoggedIn()).toBe(false);
    expect(await storage.getItem(AUTH_STORAGE_KEY, { type: 'localStorage' })).toBeNull();
  });

  it('replaces the token on updateToken', async () => {
    const active = jwt(Math.floor(Date.now() / 1000) + 3600);
    const renewed = jwt(Math.floor(Date.now() / 1000) + 7200);
    await store.login(user, active, 1);

    await store.updateToken(renewed);

    expect(store.token()).toBe(renewed);
    expect(store.isLoggedIn()).toBe(true);
  });

  it('merges the user on updateUser', async () => {
    await store.login(user, jwt(Math.floor(Date.now() / 1000) + 3600), 1);

    await store.updateUser({ name: 'Drako II' });

    expect(store.currentUser()?.name).toBe('Drako II');
    expect(store.currentUser()?.username).toBe('drako');
  });

  it('rehydrates an active session from storage', async () => {
    const saved = {
      user,
      token: jwt(Math.floor(Date.now() / 1000) + 3600),
      tenantId: 1,
      isAuthenticated: true,
      isLoading: false,
      isHydrated: true,
      isHydrating: false,
    };
    await storage.setItem(AUTH_STORAGE_KEY, saved, { type: 'localStorage' });

    const fresh = TestBed.inject(UserSessionStore);
    await fresh.init();

    expect(fresh.isHydrated()).toBe(true);
    expect(fresh.isLoggedIn()).toBe(true);
    expect(fresh.currentUser()?.username).toBe('drako');
  });
});
