import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { UserSessionStore } from '@core/store/user.session';

import { LoginRequest, RegisterRequest, TokenResponse, UpdateAvatarRequest, User } from '../interfaces';
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

  /** Actualiza (o borra) la foto de perfil y refleja el cambio en la sesión. */
  updateAvatar(payload: UpdateAvatarRequest): Observable<User> {
    return unwrap(this.authApiRepository.updateAvatar(payload)).pipe(
      // El back omite las claves cuando el avatar queda vacío (omitempty);
      // se normalizan a null para que el merge del store sí las borre.
      tap((user) =>
        this.sessionStore.updateUser({
          ...user,
          avatar_file_id: user.avatar_file_id ?? null,
          avatar_url: user.avatar_url ?? null,
        }),
      ),
    );
  }

  logout(): void {
    this.sessionStore.logout();
  }
}

function unwrap<T>(source: Observable<ApiResponse<T>>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        // success:false es error real; success:true con data:null es una
        // respuesta de solo-mensaje (p.ej. logout o confirmaciones).
        if (response.success === false) {
          subscriber.error(new Error(response.message || 'Request failed'));
          return;
        }
        if (response.data === null) {
          subscriber.next(null as T);
          subscriber.complete();
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
