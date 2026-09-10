import { StorageServiceConfig } from '@services/storage.service';

export const AUTH_STORAGE_KEY = 'synapta-auth';

export const DEFAULT_STORAGE_CONFIG: StorageServiceConfig = {
  type: 'indexedDB',
  dbName: 'Synapta-V2',
  storeName: 'synapta-store',
};
