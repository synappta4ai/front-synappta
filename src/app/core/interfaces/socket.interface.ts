export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'error';

export interface SocketMessage<T = unknown> {
  readonly data: T;
  readonly raw: string;
  readonly receivedAt: Date;
}

export interface SocketConnectOptions {
  readonly url?: string;
  readonly path?: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly protocols?: string | readonly string[];
  readonly reconnect?: boolean;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
}
