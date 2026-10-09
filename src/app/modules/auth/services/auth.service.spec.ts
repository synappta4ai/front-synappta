import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { AuthApiRepository } from '../repositories';
import { UserSessionStore } from '../../../core/store/user.session';
import { environment } from '@env/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let sessionStore: typeof UserSessionStore.prototype;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    // jsdom no expone un localStorage funcional: mock mínimo (patrón de
    // storage.service.spec) para aislar la sesión entre tests.
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

    localStorage.clear();

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthApiRepository);
    sessionStore = TestBed.inject(UserSessionStore);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('stores the session on successful login', () => {
    const response = {
      success: true,
      message: 'success',
      data: {
        token: 'jwt-123',
        user: { id: 1, username: 'drako', role_level: 3, role_name: 'USER' },
        tenant_id: 1,
        tenant_slug: 'synapta',
      },
    };

    service.login({ username: 'drako', password: 'secret' }).subscribe((session) => {
      expect(session.token).toBe('jwt-123');
      expect(sessionStore.isLoggedIn()).toBe(true);
      expect(sessionStore.currentUser()?.username).toBe('drako');
    });

    httpMock.expectOne(`${environment.API_URL}/auth/login`).flush(response);
  });

  it('errors on failed login without storing the session', () => {
    let errored = false;
    service.login({ username: 'drako', password: 'bad' }).subscribe({
      next: () => {
        throw new Error('should have errored');
      },
      error: () => {
        errored = true;
      },
    });

    httpMock
      .expectOne(`${environment.API_URL}/auth/login`)
      .flush(
        { success: false, message: 'invalid credentials', data: null },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(errored).toBe(true);
    expect(sessionStore.isLoggedIn()).toBe(false);
  });
});
