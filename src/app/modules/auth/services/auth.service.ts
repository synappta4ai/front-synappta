import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { UserSessionStore } from '@core/store/user.session';
import { unwrap } from '@utils/unwrap-api-response';

import {
  AcceptConsentRequest,
  Consent,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UpdateAvatarRequest,
  User,
} from '../interfaces';
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

  /** Registra una aceptación legal del usuario en sesión. */
  acceptConsent(payload: AcceptConsentRequest): Observable<Consent> {
    return unwrap(this.authApiRepository.acceptConsent(payload));
  }

  /** Lista las aceptaciones legales del usuario en sesión. */
  listMyConsents(): Observable<Consent[]> {
    return unwrap(this.authApiRepository.listMyConsents());
  }
}
