import { Injectable, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { of, tap, catchError } from 'rxjs';

import { ApiResponse } from '../interfaces/api.interface';
import { environment } from '@env/environment';
import { UserSessionStore } from '@core/store';

/** Opt-in de notificaciones async (video listo/fallido). */
export interface NotificationsPreferences {
  enabled: boolean;
}

const STORAGE_KEY = 'synapta-notifications-enabled';

@Injectable({ providedIn: 'root' })
export class NotificationsPreferencesService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly platformId = inject(PLATFORM_ID);

  /** true = el usuario quiere avisos de video listo/fallido. */
  readonly enabled = signal(true);
  readonly isLoading = signal(false);

  private get apiUrl(): string {
    return `${environment.API_URL}/user/preferences/notifications`;
  }

  constructor() {
    this.load();
  }

  private load(): void {
    if (!isPlatformBrowser(this.platformId) || !this.sessionStore.isLoggedIn()) {
      return;
    }
    this.isLoading.set(true);
    this.http
      .get<ApiResponse<NotificationsPreferences>>(this.apiUrl)
      .pipe(
        tap((res) => {
          if (res.data) {
            this.enabled.set(res.data.enabled);
            try {
              localStorage.setItem(STORAGE_KEY, String(res.data.enabled));
            } catch {
              /* almacenamiento no disponible */
            }
          }
        }),
        catchError(() => {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw !== null) {
              this.enabled.set(raw === 'true');
            }
          } catch {
            /* almacenamiento no disponible */
          }
          return of(null);
        }),
        tap(() => this.isLoading.set(false)),
      )
      .subscribe();
  }

  setEnabled(enabled: boolean): void {
    const prev = this.enabled();
    this.enabled.set(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      /* almacenamiento no disponible */
    }
    this.http.put<ApiResponse<NotificationsPreferences>>(this.apiUrl, { enabled }).subscribe({
      error: () => this.enabled.set(prev),
    });
  }
}
