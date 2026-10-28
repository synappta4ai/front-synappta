import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';
import { SocketConnectOptions, SocketMessage, SocketStatus } from '@interfaces/socket.interface';

const DEFAULT_RECONNECT_DELAY_MS = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private readonly platformId = inject(PLATFORM_ID);

  private socket: WebSocket | null = null;
  private options: SocketConnectOptions | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualClose = false;

  readonly status = signal<SocketStatus>('idle');
  readonly messages = signal<readonly SocketMessage[]>([]);
  readonly lastMessage = computed<SocketMessage | null>(() => {
    const messages = this.messages();
    return messages[messages.length - 1] ?? null;
  });
  readonly isConnected = computed(() => this.status() === 'open');

  connect(options: SocketConnectOptions = {}): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.close();
    this.options = options;
    this.manualClose = false;
    this.reconnectAttempts = 0;
    this.open();
  }

  send(payload: unknown): boolean {
    if (!isPlatformBrowser(this.platformId) || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return true;
  }

  close(code?: number, reason?: string): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    if (!this.socket) {
      this.status.set('closed');
      return;
    }
    this.status.set('closing');
    this.socket.close(code, reason);
  }

  clearMessages(): void {
    this.messages.set([]);
  }

  private open(): void {
    const options = this.options ?? {};
    this.status.set('connecting');

    const socket = this.createSocket(this.buildUrl(options), options.protocols);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.reconnectAttempts = 0;
      this.status.set('open');
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (this.socket !== socket) {
        return;
      }
      this.messages.update((messages) => [...messages, this.toMessage(event.data)]);
    };

    socket.onerror = () => {
      if (this.socket !== socket) {
        return;
      }
      this.status.set('error');
    };

    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.status.set('closed');
      if (!this.manualClose && options.reconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private createSocket(url: string, protocols: SocketConnectOptions['protocols']): WebSocket {
    if (protocols === undefined) {
      return new WebSocket(url);
    }
    return typeof protocols === 'string'
      ? new WebSocket(url, protocols)
      : new WebSocket(url, [...protocols]);
  }

  private buildUrl(options: SocketConnectOptions): string {
    const base = options.url ?? `${this.socketBase()}${options.path ?? ''}`;
    const query = this.toQueryString(options.query);
    if (!query) {
      return base;
    }
    return `${base}${base.includes('?') ? '&' : '?'}${query}`;
  }

  private socketBase(): string {
    return environment.SOCKET_URL.replace(/\/+$/, '');
  }

  private toQueryString(query: SocketConnectOptions['query']): string {
    if (!query) {
      return '';
    }
    return Object.entries(query)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
  }

  private toMessage(data: unknown): SocketMessage {
    if (typeof data !== 'string') {
      return { data, raw: String(data), receivedAt: new Date() };
    }
    try {
      return { data: JSON.parse(data), raw: data, receivedAt: new Date() };
    } catch {
      return { data, raw: data, receivedAt: new Date() };
    }
  }

  private scheduleReconnect(): void {
    const options = this.options;
    if (!options) {
      return;
    }
    const maxAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    if (this.reconnectAttempts >= maxAttempts) {
      return;
    }
    this.reconnectAttempts += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
