import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';
import { environment } from '@env/environment';

import {
  AcceptConsentRequest,
  Consent,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UpdateAvatarRequest,
  User,
} from '../interfaces';

@Injectable({ providedIn: 'root' })
export class AuthApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.API_URL;

  login(payload: LoginRequest): Observable<ApiResponse<TokenResponse>> {
    return this.http.post<ApiResponse<TokenResponse>>(`${this.apiUrl}/auth/login`, payload);
  }

  register(payload: RegisterRequest): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(`${this.apiUrl}/auth/register`, payload);
  }

  getProfile(): Observable<ApiResponse<User>> {
    return this.http.get<ApiResponse<User>>(`${this.apiUrl}/auth/profile`);
  }

  /** Actualiza (o borra, con payload vacío) la foto de perfil del usuario. */
  updateAvatar(payload: UpdateAvatarRequest): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`${this.apiUrl}/user/profile/avatar`, payload);
  }

  /** Registra una aceptación legal (prueba Ley 1581). */
  acceptConsent(payload: AcceptConsentRequest): Observable<ApiResponse<Consent>> {
    return this.http.post<ApiResponse<Consent>>(`${this.apiUrl}/consents`, payload);
  }

  /** Lista las aceptaciones legales del usuario en sesión. */
  listMyConsents(): Observable<ApiResponse<Consent[]>> {
    return this.http.get<ApiResponse<Consent[]>>(`${this.apiUrl}/consents/me`);
  }
}
