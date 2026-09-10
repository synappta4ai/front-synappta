import { TestBed } from '@angular/core/testing';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LocalStorageService],
    });

    service = TestBed.inject(LocalStorageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Service Interface', () => {
    it('should have setItem method', () => {
      expect(typeof service.setItem).toBe('function');
    });

    it('should have getItem method', () => {
      expect(typeof service.getItem).toBe('function');
    });

    it('should have removeItem method', () => {
      expect(typeof service.removeItem).toBe('function');
    });

    it('should have clear method', () => {
      expect(typeof service.clear).toBe('function');
    });

    it('should have key method', () => {
      expect(typeof service.key).toBe('function');
    });

    it('should have length property', () => {
      // length is defined as a property but may be undefined before afterNextRender
      expect('length' in service).toBeTruthy();
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty mock storage', () => {
      // Initially returns null due to mock storage class
      const result = service.getItem('anyKey');
      expect(result).toBeNull();
    });

    it('should handle getItem for non-existent key', () => {
      const result = service.getItem('nonExistentKey');
      expect(result).toBeNull();
    });
  });
});
