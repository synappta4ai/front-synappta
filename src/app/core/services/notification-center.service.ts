import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiResponse } from '../interfaces/api.interface';
import { environment } from '@env/environment';
import { UserSessionStore } from '@core/store';

/** Aviso persistente del centro nativo (video listo/fallido…). */
export interface CenterNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  task_id: string;
  read_at?: string | null;
  created_at: string;
}

const POLL_MS = 30000;

/** Campana nativa: avisos persistentes del usuario con badge de no leídos. */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly platformId = inject(PLATFORM_ID);

  readonly items = signal<CenterNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), POLL_MS);
    }
  }

  async refresh(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.sessionStore.isLoggedIn()) {
      return;
    }
    this.loading.set(true);
    try {
      const [feed, count] = await Promise.all([
        firstValueFrom(
          this.http.get<ApiResponse<CenterNotification[]>>(
            `${environment.API_URL}/push/notifications`,
          ),
        ),
        firstValueFrom(
          this.http.get<ApiResponse<{ unread: number }>>(
            `${environment.API_URL}/push/notifications/unread`,
          ),
        ),
      ]);
      this.items.set(feed.data ?? []);
      this.unread.set(count.data?.unread ?? 0);
    } catch {
      /* el back puede no tener el centro aún: la campana sigue con eventos live */
    } finally {
      this.loading.set(false);
    }
  }

  async markAllRead(): Promise<void> {
    if (!this.sessionStore.isLoggedIn()) {
      return;
    }
    try {
      await firstValueFrom(
        this.http.post<ApiResponse<{ read: number }>>(
          `${environment.API_URL}/push/notifications/read`,
          {},
        ),
      );
    } finally {
      await this.refresh();
    }
  }
}
