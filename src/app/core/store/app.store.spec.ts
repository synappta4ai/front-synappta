import { TestBed } from '@angular/core/testing';

import { AppStore } from './app.store';

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

describe('AppStore', () => {
  let store: AppStore;

  beforeEach(async () => {
    mockLocalStorage();

    await TestBed.configureTestingModule({}).compileComponents();

    store = TestBed.inject(AppStore);
  });

  afterEach(() => {
    store.destroy();
  });

  it('starts with the default state', () => {
    expect(store.isOnline()).toBe(true);
    expect(store.isLocalConnected()).toBe(false);
    expect(store.isInitialized()).toBe(false);
    expect(store.isLoading()).toBe(false);
    expect(store.isReady()).toBe(false);
    expect(store.hasConnection()).toBe(true);
  });

  it('initializes and becomes ready', async () => {
    await store.init();

    expect(store.isInitialized()).toBe(true);
    expect(store.isLoading()).toBe(false);
    expect(store.isReady()).toBe(true);
  });

  it('tracks the online status and connectivity', async () => {
    await store.setOnlineStatus(false);
    expect(store.isOnline()).toBe(false);
    expect(store.hasConnection()).toBe(false);

    await store.setLocalConnected(true);
    expect(store.hasConnection()).toBe(true);
  });

  it('toggles the loading state', async () => {
    await store.init();

    store.setLoading(true);
    expect(store.isLoading()).toBe(true);
    expect(store.isReady()).toBe(false);

    store.setLoading(false);
    expect(store.isLoading()).toBe(false);
    expect(store.isReady()).toBe(true);
  });

  it('records the last sync time', async () => {
    await store.syncNow();

    expect(store.lastSyncTime()).toBeInstanceOf(Date);
  });
});
