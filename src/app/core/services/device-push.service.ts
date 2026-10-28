import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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

/** La VAPID pública es un punto P-256 sin comprimir: 65 bytes que empiezan con 0x04. */
function validVapidPublicKey(base64: string): boolean {
  try {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return raw.length === 65 && raw.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

/** Compara la applicationServerKey de una suscripción con una VAPID pública. */
function sameApplicationKey(sub: PushSubscription, publicKey: string): boolean {
  try {
    const current = sub.options?.applicationServerKey;
    if (!current) {
      return false;
    }
    const expected = urlBase64ToUint8Array(publicKey);
    const view = current instanceof ArrayBuffer ? new Uint8Array(current) : new Uint8Array(current);
    if (view.byteLength !== expected.byteLength) {
      return false;
    }
    for (let i = 0; i < view.byteLength; i++) {
      if (view[i] !== expected[i]) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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
  /** Detalle técnico del último fallo (mensaje del back o del navegador). */
  readonly errorDetail = signal<string | null>(null);

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

  /** Relee el permiso del navegador (por si el usuario lo cambió en ajustes). */
  refreshPermission(): NotificationPermission | 'unsupported' {
    if (!isPlatformBrowser(this.platformId) || typeof Notification === 'undefined') {
      this.permission.set('unsupported');
      return 'unsupported';
    }
    this.permission.set(Notification.permission);
    return Notification.permission;
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
      this.fail('NOTIFICATIONS.DEVICE_UNSUPPORTED', null);
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    this.errorDetail.set(null);
    try {
      let public_key = '';
      try {
        ({ public_key } = await this.getPublicKey());
      } catch (e) {
        this.failHttp('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', e, 'GET push/public-key');
        return false;
      }
      if (!public_key) {
        this.fail('NOTIFICATIONS.DEVICE_NOT_CONFIGURED', 'empty public key from GET push/public-key');
        return false;
      }
      if (!validVapidPublicKey(public_key)) {
        this.fail(
          'NOTIFICATIONS.DEVICE_NOT_CONFIGURED',
          `invalid VAPID public key from server (${public_key.length} chars, want a 65-byte P-256 point)`
        );
        return false;
      }
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') {
        this.fail('NOTIFICATIONS.DEVICE_PERMISSION_DENIED', `permission=${perm}`);
        return false;
      }
      let reg: ServiceWorkerRegistration;
      try {
        reg = await this.ensureWorker();
      } catch (e) {
        this.fail('NOTIFICATIONS.DEVICE_WORKER_FAILED', this.describe(e));
        return false;
      }
      let sub = await reg.pushManager.getSubscription();
      // La suscripción vieja queda atada a la VAPID anterior (rotación de
      // claves o QR de otra cuenta): si la clave cambió, re-suscribir.
      if (sub && !sameApplicationKey(sub, public_key)) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
      }
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(public_key),
          });
        } catch (e) {
          this.fail('NOTIFICATIONS.DEVICE_PUSH_FAILED', this.describe(e));
          return false;
        }
      }
      try {
        await this.postSubscription(sub.toJSON(), `${this.apiUrl}/push/subscriptions`);
      } catch (e) {
        this.failHttp('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', e, 'POST push/subscriptions');
        return false;
      }
      this.rememberEndpoint(sub.endpoint);
      return true;
    } catch (e) {
      this.fail('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', this.describe(e));
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
    } catch (e) {
      console.error('[push] unsubscribe failed', e);
    } finally {
      this.forgetEndpoint();
      this.busy.set(false);
    }
  }

  /**
   * Rota el par VAPID propio del usuario (auto-generado en el back).
   * Las suscripciones viejas quedan atadas a la clave anterior: tras rotar
   * se re-suscribe este dispositivo automáticamente.
   */
  async rotateKeys(): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<{ public_key: string }>>(
          `${this.apiUrl}/push/vapid/rotate`,
          {},
        ),
      );
      return res.data?.public_key ?? null;
    } catch (e) {
      this.failHttp('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', e, 'POST push/vapid/rotate');
      return null;
    }
  }

  /** Envía un push de prueba a todos mis dispositivos. */
  async testPush(message?: string): Promise<number> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<{ sent_to: number }>>(`${this.apiUrl}/push/test`, {
        message: message ?? '',
      }),
    );
    return res.data?.sent_to ?? 0;
  }

  /** Graba un aviso de prueba en el centro nativo (campana). */
  async testCenter(message?: string): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<{ message: string }>>(
        `${this.apiUrl}/push/notifications/test`,
        { message: message ?? '' },
      ),
    );
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
      this.fail('NOTIFICATIONS.DEVICE_UNSUPPORTED', null);
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    this.errorDetail.set(null);
    try {
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') {
        this.fail('NOTIFICATIONS.DEVICE_PERMISSION_DENIED', `permission=${perm}`);
        return false;
      }
      let reg: ServiceWorkerRegistration;
      try {
        reg = await this.ensureWorker();
      } catch (e) {
        this.fail('NOTIFICATIONS.DEVICE_WORKER_FAILED', this.describe(e));
        return false;
      }
      // El QR es público (sin login): la clave es la del dueño del código,
      // no la del endpoint autenticado. Se pide primero para poder detectar
      // una suscripción vieja atada a otra clave.
      let public_key = '';
      try {
        const keyRes = await firstValueFrom(
          this.http.get<ApiResponse<{ public_key: string; enabled: boolean }>>(
            `${this.apiUrl}/push/pairing/${encodeURIComponent(code)}/public-key`,
          ),
        );
        public_key = keyRes.data?.public_key ?? '';
        if (!keyRes.data?.enabled || !public_key) {
          this.fail('NOTIFICATIONS.DEVICE_NOT_CONFIGURED', 'empty public key from pairing public-key');
          return false;
        }
        if (!validVapidPublicKey(public_key)) {
          this.fail(
            'NOTIFICATIONS.DEVICE_NOT_CONFIGURED',
            `invalid VAPID public key from pairing (${public_key.length} chars, want a 65-byte P-256 point)`
          );
          return false;
        }
      } catch (e) {
        if (this.isInvalidCode(e)) {
          this.fail('NOTIFICATIONS.DEVICE_PAIR_INVALID', this.describe(e));
        } else {
          this.failHttp('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', e, 'GET pairing public-key');
        }
        return false;
      }
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameApplicationKey(sub, public_key)) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
      }
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(public_key),
          });
        } catch (e) {
          this.fail('NOTIFICATIONS.DEVICE_PUSH_FAILED', this.describe(e));
          return false;
        }
      }
      try {
        await this.postSubscription(
          sub.toJSON(),
          `${this.apiUrl}/push/pairing/${encodeURIComponent(code)}/redeem`,
        );
      } catch (e) {
        if (this.isInvalidCode(e)) {
          this.fail('NOTIFICATIONS.DEVICE_PAIR_INVALID', this.describe(e));
        } else {
          this.failHttp('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', e, 'POST pairing redeem');
        }
        return false;
      }
      this.rememberEndpoint(sub.endpoint);
      return true;
    } catch (e) {
      this.fail('NOTIFICATIONS.DEVICE_SUBSCRIBE_FAILED', this.describe(e));
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

  private fail(key: string, detail: string | null): void {
    this.error.set(key);
    this.errorDetail.set(detail);
    console.error('[push] subscribe failed:', key, detail ?? '');
  }

  private failHttp(key: string, e: unknown, where: string): void {
    const detail = this.httpDetail(e);
    this.error.set(detail.status ? 'NOTIFICATIONS.DEVICE_HTTP_ERROR' : key);
    this.errorDetail.set(detail.status ? `${where} → HTTP ${detail.status}: ${detail.body}` : `${where}: ${this.describe(e)}`);
    console.error('[push] subscribe failed:', where, e);
  }

  private httpDetail(e: unknown): { status: number | null; body: string } {
    if (e instanceof HttpErrorResponse) {
      const raw = e.error;
      const body =
        typeof raw === 'string'
          ? raw
          : (raw?.error ?? raw?.message ?? e.message ?? '').toString().slice(0, 300);
      return { status: e.status || null, body: body || e.message };
    }
    return { status: null, body: this.describe(e) };
  }

  private isInvalidCode(e: unknown): boolean {
    if (e instanceof HttpErrorResponse && e.status === 400) {
      const raw = e.error;
      const msg = (typeof raw === 'string' ? raw : (raw?.error ?? '')).toString().toLowerCase();
      return msg.includes('invalid or expired');
    }
    return false;
  }

  private describe(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      const raw = e.error;
      const body = typeof raw === 'string' ? raw : (raw?.error ?? raw?.message ?? e.message ?? '');
      return `HTTP ${e.status}: ${String(body).slice(0, 300)}`;
    }
    if (e instanceof Error) {
      return e.message.slice(0, 300);
    }
    return String(e).slice(0, 300);
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
