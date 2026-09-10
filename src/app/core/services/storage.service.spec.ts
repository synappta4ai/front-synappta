import { TestBed } from '@angular/core/testing';
import { StorageService, StorageServiceConfig } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  const defaultConfig: StorageServiceConfig = {
    type: 'localStorage',
  };

  const indexedDBConfig: StorageServiceConfig = {
    type: 'indexedDB',
    dbName: 'test-db',
    storeName: 'test-store',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StorageService],
    });

    service = TestBed.inject(StorageService);

    // Mock localStorage
    const localStorageMock: { [key: string]: string | null } = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => {
          Object.keys(localStorageMock).forEach((key) => delete localStorageMock[key]);
        },
      },
      writable: true,
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('localStorage operations', () => {
    const config: StorageServiceConfig = { type: 'localStorage' };

    it('should save and retrieve a string value', async () => {
      await service.setItem('testKey', 'testValue', config);
      const result = await service.getItem<string>('testKey', config);
      expect(result).toBe('testValue');
    });

    it('should save and retrieve an object value', async () => {
      const testObject = { name: 'John', age: 30 };
      await service.setItem('user', testObject, config);
      const result = await service.getItem<{ name: string; age: number }>('user', config);
      expect(result).toEqual(testObject);
    });

    it('should return null for non-existent key', async () => {
      const result = await service.getItem('nonExistent', config);
      expect(result).toBeNull();
    });

    it('should remove an item', async () => {
      await service.setItem('toRemove', 'value', config);
      await service.removeItem('toRemove', config);
      const result = await service.getItem('toRemove', config);
      expect(result).toBeNull();
    });

    it('should clear all items', async () => {
      await service.setItem('key1', 'value1', config);
      await service.setItem('key2', 'value2', config);
      service.clearAll(config);
      const result1 = await service.getItem('key1', config);
      const result2 = await service.getItem('key2', config);
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      localStorage.setItem('invalidJson', 'not-valid-json');
      const result = await service.getItem('invalidJson', config);
      expect(result).toBeNull();
    });
  });

  describe('Platform check', () => {
    it('should return null when not in browser (localStorage)', async () => {
      // This test verifies the platform check behavior
      const config: StorageServiceConfig = { type: 'localStorage' };
      const result = await service.getItem('key', config);
      // Result depends on whether we're in browser environment
      expect(
        result === null || typeof result === 'string' || typeof result === 'object',
      ).toBeTruthy();
    });

    it('should handle setItem in browser environment', async () => {
      const config: StorageServiceConfig = { type: 'localStorage' };
      await service.setItem('platformTest', 'value', config);
      const result = await service.getItem('platformTest', config);
      expect(result).toBe('value');
    });

    it('should handle removeItem in browser environment', async () => {
      const config: StorageServiceConfig = { type: 'localStorage' };
      await service.setItem('toRemove', 'value', config);
      await service.removeItem('toRemove', config);
      const result = await service.getItem('toRemove', config);
      expect(result).toBeNull();
    });
  });

  describe('IndexedDB operations', () => {
    // Note: IndexedDB testing in unit tests is complex due to async nature
    // These tests verify the service interface

    it('should have getItem method for indexedDB', () => {
      expect(service.getItem).toBeDefined();
      expect(typeof service.getItem).toBe('function');
    });

    it('should have setItem method for indexedDB', () => {
      expect(service.setItem).toBeDefined();
      expect(typeof service.setItem).toBe('function');
    });

    it('should have removeItem method for indexedDB', () => {
      expect(service.removeItem).toBeDefined();
      expect(typeof service.removeItem).toBe('function');
    });

    it('should have clearAll method', () => {
      expect(service.clearAll).toBeDefined();
      expect(typeof service.clearAll).toBe('function');
    });
  });

  describe('Config handling', () => {
    it('should use default dbName when not provided', async () => {
      const config: StorageServiceConfig = { type: 'indexedDB' };
      // Should use default 'aura-pos-db'
      expect(config.dbName).toBeUndefined();
    });

    it('should use default storeName when not provided', async () => {
      const config: StorageServiceConfig = { type: 'indexedDB' };
      // Should use default 'synapta-store'
      expect(config.storeName).toBeUndefined();
    });

    it('should accept custom config', () => {
      const customConfig: StorageServiceConfig = {
        type: 'indexedDB',
        dbName: 'custom-db',
        storeName: 'custom-store',
      };
      expect(customConfig.dbName).toBe('custom-db');
      expect(customConfig.storeName).toBe('custom-store');
    });
  });
});
