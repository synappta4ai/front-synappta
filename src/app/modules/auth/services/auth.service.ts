import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { UserSessionStore } from '@core/store/user.session';

import { LoginRequest, RegisterRequest, TokenResponse, User } from '../interfaces';
import { AuthApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApiRepository = inject(AuthApiRepository);
  private readonly sessionStore = inject(UserSessionStore);

  login(payload: LoginRequest): Observable<TokenResponse> {
    return unwrap(this.authApiRepository.login(payload)).pipe(
      tap((data) => this.sessionStore.login(data.user, data.token, data.tenant_id)),
    );
  }

  register(payload: RegisterRequest): Observable<User> {
    return unwrap(this.authApiRepository.register(payload));
  }

  getProfile(): Observable<User> {
    return unwrap(this.authApiRepository.getProfile());
  }

  logout(): void {
    this.sessionStore.logout();
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
