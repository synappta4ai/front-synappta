import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { TokenStorageService } from '@services/token-storage.service';

import { LoginRequest, RegisterRequest, TokenResponse, User } from '../interfaces';
import { AuthApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApiRepository = inject(AuthApiRepository);
  private readonly tokenStorage = inject(TokenStorageService);

  private readonly tokenSignal = signal<string | null>(this.tokenStorage.getToken());
  private readonly userSignal = signal<User | null>(this.tokenStorage.getUser<User>());

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);
  readonly roleLevel = computed(() => this.userSignal()?.role_level ?? null);

  login(payload: LoginRequest): Observable<TokenResponse> {
    return unwrap(this.authApiRepository.login(payload)).pipe(
      tap((data) => this.persistSession(data.token, data.user)),
    );
  }

  register(payload: RegisterRequest): Observable<User> {
    return unwrap(this.authApiRepository.register(payload));
  }

  getProfile(): Observable<User> {
    return unwrap(this.authApiRepository.getProfile());
  }

  logout(): void {
    this.tokenStorage.clear();
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  private persistSession(token: string, user: User): void {
    this.tokenStorage.saveSession(token, user);
    this.tokenSignal.set(token);
    this.userSignal.set(user);
  }
}

function unwrap<T>(source: Observable<{ data: T | null; message: string }>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        if (response.data === null) {
          subscriber.error(new Error(response.message || 'Unexpected empty response'));
          return;
        }
        subscriber.next(response.data);
        subscriber.complete();
      },
      error: (err: unknown) => subscriber.error(err),
    });
    return () => subscription.unsubscribe();
  });
}
