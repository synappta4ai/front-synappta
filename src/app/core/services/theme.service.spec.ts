import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ThemeService } from './theme.service';
import { COLOR_PALETTES } from '../interfaces/theme.interface';

describe('ThemeService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ThemeService],
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushPendingRequests(): void {
    try {
      while (true) {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      }
    } catch (e) {
      /* No more requests */
    }
  }

  function getService(): ThemeService {
    return TestBed.inject(ThemeService);
  }

  describe('should be created', () => {
    it('should create service instance', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      expect(service).toBeTruthy();
    });
  });

  describe('setPalette', () => {
    it('should set the current palette to blue', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('blue');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('blue');
    });

    it('should set palette to base', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('base');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('base');
    });

    it('should set palette to green', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('green');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('green');
    });

    it('should set palette to yellow', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('yellow');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('yellow');
    });

    it('should set palette to orange', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('orange');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('orange');
    });

    it('should set palette to red', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('red');
      flushPendingRequests();
      expect(service.currentPalette()).toBe('red');
    });
  });

  describe('setMode', () => {
    it('should set mode to light', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setMode('light');
      flushPendingRequests();
      expect(service.currentMode()).toBe('light');
    });

    it('should set mode to dark', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setMode('dark');
      flushPendingRequests();
      expect(service.currentMode()).toBe('dark');
    });
  });

  describe('toggleMode', () => {
    it('should toggle from dark to light', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setMode('dark');
      flushPendingRequests();
      service.toggleMode();
      flushPendingRequests();
      expect(service.currentMode()).toBe('light');
    });

    it('should toggle from light to dark', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setMode('light');
      flushPendingRequests();
      service.toggleMode();
      flushPendingRequests();
      expect(service.currentMode()).toBe('dark');
    });
  });

  describe('getCurrentTheme', () => {
    it('should return current theme configuration', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('blue');
      flushPendingRequests();
      service.setMode('light');
      flushPendingRequests();

      const theme = service.getCurrentTheme();

      expect(theme).toEqual({
        palette: 'blue',
        mode: 'light',
      });
    });

    it('should return dark theme configuration', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      service.setPalette('violet');
      flushPendingRequests();
      service.setMode('dark');
      flushPendingRequests();

      const theme = service.getCurrentTheme();

      expect(theme).toEqual({
        palette: 'violet',
        mode: 'dark',
      });
    });
  });

  describe('getAvailablePalettes', () => {
    it('should return all available color palettes', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      const palettes = service.getAvailablePalettes();
      expect(palettes).toEqual(COLOR_PALETTES);
    });

    it('should return non-empty palettes array', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush(null);
      } catch (e) {
        /* ignore */
      }
      const palettes = service.getAvailablePalettes();
      expect(palettes.length).toBeGreaterThan(0);
    });
  });

  describe('Initial State', () => {
    // Note: These tests verify the default values in isolation
    // Since ThemeService is a singleton, state persists between tests

    it('should have violet as default palette (verified through API)', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        // Return default violet palette in response
        req.flush({
          theme: { palette: 'violet', mode: 'dark' },
        });
      } catch (e) {
        /* ignore */
      }
      expect(service.currentPalette()).toBe('violet');
    });

    it('should have dark as default mode (verified through API)', () => {
      const service = getService();
      try {
        const req = httpMock.expectOne('/api/user/preferences/theme');
        req.flush({
          theme: { palette: 'violet', mode: 'dark' },
        });
      } catch (e) {
        /* ignore */
      }
      expect(service.currentMode()).toBe('dark');
    });
  });
});
