import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiResponse } from '../interfaces/api.interface';
import { environment } from '@env/environment';

const ENDPOINT_KEY = 'synapta-push-endpoint';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64Safe);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

/** Push web nativo en este dispositivo + vinculación por QR. */
@Injectable({ providedIn: 'root' })
export class DevicePushService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  readonly supported = signal(
    isPlatformBrowser(this.platformId) &&
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
  );
  readonly permission = signal<NotificationPermission | 'unsupported'>(
    !isPlatformBrowser(this.platformId) || typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission,
  );
  /** true si este navegador ya registró su subscription en el back. */
  readonly subscribed = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      this.subscribed.set(!!localStorage.getItem(ENDPOINT_KEY));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private get apiUrl(): string {
    return environment.API_URL;
  }

  /** Clave VAPID pública + si el back tiene push configurado. */
  async getPublicKey(): Promise<{ public_key: string; enabled: boolean }> {
    const res = await firstValueFrom(
      this.http.get<ApiResponse<{ public_key: string; enabled: boolean }>>(
        `${this.apiUrl}/push/public-key`,
      ),
    );
    return res.data ?? { public_key: '', enabled: false };
  }

  /** Registra el service worker (idempotente). */
  async ensureWorker(): Promise<ServiceWorkerRegistration> {
    return navigator.serviceWorker.register('/push-sw.js');
  }

  /** Suscribe este dispositivo al push del usuario actual (requiere login). */
  async subscribe(): Promise<boolean> {
    if (!this.supported()) {
      this.error.set('NOTIFICATIONS.DEVICE_UNSUPPORTED');
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { public_key, enabled } = await this.getPublicKey();
      if (!enabled || !public_key) {
        this.error.set('NOTIFICATIONS.DEVICE_NOT_CONFIGURED');
        return false;
      }
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') {
        this.error.set('NOTIFICATIONS.DEVICE_PERMISSION_DENIED');
        return false;
      }
      const reg = await this.ensureWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      await this.postSubscription(sub.toJSON(), `${this.apiUrl}/push/subscriptions`);
      this.rememberEndpoint(sub.endpoint);
      return true;
    } catch (e) {
      this.error.set('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Da de baja este dispositivo (requiere login). */
  async unsubscribe(): Promise<void> {
    const endpoint = this.storedEndpoint();
    this.busy.set(true);
    try {
      if (endpoint) {
        await firstValueFrom(
          this.http.delete<ApiResponse<null>>(`${this.apiUrl}/push/subscriptions`, {
            params: { endpoint },
          }),
        );
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    } finally {
      this.forgetEndpoint();
      this.busy.set(false);
    }
  }

  /**
   * Crea un código QR de vinculación (10 min, un solo uso). Requiere login.
   * tenantSlug: la consola admin lo pasa para vincular al tenant gestionado.
   */
  async createPairing(tenantSlug?: string): Promise<{ code: string; expires_at: string }> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<{ code: string; expires_at: string }>>(
        `${this.apiUrl}/push/pairing`,
        {},
        tenantSlug ? { headers: { 'X-Tenant-Slug': tenantSlug } } : {},
      ),
    );
    if (!res.data) {
      throw new Error('empty pairing');
    }
    return res.data;
  }

  /**
   * Canjea un código QR en este dispositivo (público, sin login): suscribe el
   * push del navegador y lo vincula a la cuenta que generó el QR.
   */
  async redeemPairing(code: string): Promise<boolean> {
    if (!this.supported()) {
      this.error.set('NOTIFICATIONS.DEVICE_UNSUPPORTED');
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') {
        this.error.set('NOTIFICATIONS.DEVICE_PERMISSION_DENIED');
        return false;
      }
      const reg = await this.ensureWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { public_key, enabled } = await this.getPublicKey();
        if (!enabled || !public_key) {
          this.error.set('NOTIFICATIONS.DEVICE_NOT_CONFIGURED');
          return false;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      await this.postSubscription(
        sub.toJSON(),
        `${this.apiUrl}/push/pairing/${encodeURIComponent(code)}/redeem`,
      );
      this.rememberEndpoint(sub.endpoint);
      return true;
    } catch {
      this.error.set('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async postSubscription(json: PushSubscriptionJSON, url: string): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<{ subscribed: boolean }>>(url, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.['p256dh'], auth: json.keys?.['auth'] },
      }),
    );
  }

  private storedEndpoint(): string | null {
    try {
      return localStorage.getItem(ENDPOINT_KEY);
    } catch {
      return null;
    }
  }

  private rememberEndpoint(endpoint: string): void {
    try {
      localStorage.setItem(ENDPOINT_KEY, endpoint);
    } catch {
      /* almacenamiento no disponible */
    }
    this.subscribed.set(true);
  }

  private forgetEndpoint(): void {
    try {
      localStorage.removeItem(ENDPOINT_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    this.subscribed.set(false);
  }
}
