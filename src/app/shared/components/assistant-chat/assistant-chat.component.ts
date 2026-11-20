import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UserSessionStore } from '@core/store/user.session';
import { environment } from '@env/environment';

/** Modelo multimodal por defecto del asistente global. */
const ASSISTANT_MODEL = 'google/gemini-3.8-flash';
const ASSISTANT_PROVIDER = 'openrouter';
const POSITION_KEY = 'synapta:assistant:pos';
const CONVERSATION_KEY = 'synapta:assistant:conv';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantEvent {
  name: string;
  data: Record<string, unknown>;
}

/**
 * Asistente global de la app: ventana flotante y arrastrable disponible en
 * todos los módulos. Sabe qué hace cada sección y responde dudas de uso sin
 * ejecutar acciones ni consumir créditos de generación.
 */
@Component({
  selector: 'app-assistant-chat',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './assistant-chat.component.html',
  styleUrl: './assistant-chat.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantChatComponent {
  private readonly session = inject(UserSessionStore);
  private readonly translate = inject(TranslateService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  protected readonly open = signal(false);
  protected readonly messages = signal<readonly AssistantMessage[]>([]);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly position = signal<{ x: number; y: number } | null>(null);

  protected readonly canSend = computed(() => !this.busy() && this.draft().trim().length > 0);

  private drag: { dx: number; dy: number } | null = null;

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (!next) return;
    this.ensurePosition();
    if (typeof window !== 'undefined') {
      setTimeout(() => this.input()?.nativeElement.focus(), 0);
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected reset(): void {
    this.messages.set([]);
    this.error.set(null);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(CONVERSATION_KEY);
    } catch {
      // localStorage puede estar bloqueado; la conversación se reinicia igual.
    }
  }

  protected send(): void {
    const message = this.draft().trim();
    if (!message || this.busy()) return;
    this.draft.set('');
    this.error.set(null);
    this.messages.update((list) => [...list, { role: 'user', content: message }]);
    this.busy.set(true);
    void this.streamTurn(message).finally(() => this.busy.set(false));
  }

  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
    keyboard.preventDefault();
    this.send();
  }

  // ── Arrastre de la ventana ────────────────────────────────────────────

  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    const element = this.panel()?.nativeElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    this.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  protected onDrag(event: PointerEvent): void {
    if (!this.drag) return;
    this.moveTo(event.clientX - this.drag.dx, event.clientY - this.drag.dy);
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.drag) return;
    this.drag = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.persistPosition();
  }

  private ensurePosition(): void {
    if (typeof window === 'undefined') return;
    const element = this.panel()?.nativeElement;
    const width = element?.offsetWidth ?? 380;
    const height = element?.offsetHeight ?? 520;
    const saved = this.readPosition();
    if (saved) {
      this.moveTo(saved.x, saved.y);
      return;
    }
    this.position.set({
      x: Math.max(8, window.innerWidth - width - 24),
      y: Math.max(8, window.innerHeight - height - 88),
    });
  }

  private moveTo(x: number, y: number): void {
    if (typeof window === 'undefined') return;
    const element = this.panel()?.nativeElement;
    const width = element?.offsetWidth ?? 380;
    const height = element?.offsetHeight ?? 520;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    this.position.set({
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    });
  }

  private readPosition(): { x: number; y: number } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      return typeof parsed.x === 'number' && typeof parsed.y === 'number'
        ? { x: parsed.x, y: parsed.y }
        : null;
    } catch {
      return null;
    }
  }

  private persistPosition(): void {
    const position = this.position();
    if (!position || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      // Sin persistencia: la ventana conserva su posición en esta sesión.
    }
  }

  // ── Conversación (SSE) ────────────────────────────────────────────────

  private async streamTurn(message: string): Promise<void> {
    const token = this.session.token();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${environment.API_URL}/agent/chat/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: this.conversationId(),
          message,
          provider: ASSISTANT_PROVIDER,
          model: ASSISTANT_MODEL,
          context: this.screenContext(),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          detail ? `HTTP ${response.status}: ${detail.slice(0, 200)}` : `HTTP ${response.status}`,
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const event = parseAssistantEvent(raw);
          if (!event) continue;
          if (event.name === 'meta') {
            const conversation = event.data['conversation_id'];
            if (typeof conversation === 'string' && conversation) {
              this.saveConversation(conversation);
            }
          } else if (event.name === 'text') {
            this.appendAssistant(String(event.data['text'] ?? ''));
          } else if (event.name === 'error') {
            throw new Error(
              String(event.data['message'] ?? this.translate.instant('ASSISTANT.ERROR')),
            );
          }
        }
      }
    } catch (err) {
      this.error.set(
        err instanceof Error && err.message
          ? err.message
          : this.translate.instant('ASSISTANT.ERROR'),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private appendAssistant(text: string): void {
    if (!text) return;
    this.messages.update((list) => {
      const last = list[list.length - 1];
      if (last?.role === 'assistant') {
        return [...list.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...list, { role: 'assistant', content: text }];
    });
  }

  private conversationId(): string {
    if (typeof localStorage === 'undefined') return 'assistant-session';
    try {
      const saved = localStorage.getItem(CONVERSATION_KEY);
      if (saved) return saved;
      const created = `assistant-${uuid()}`;
      localStorage.setItem(CONVERSATION_KEY, created);
      return created;
    } catch {
      return 'assistant-session';
    }
  }

  private saveConversation(id: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CONVERSATION_KEY, id);
    } catch {
      // Sin persistencia: la conversación sigue en memoria durante la sesión.
    }
  }

  private screenContext(): string | undefined {
    if (typeof document === 'undefined' || typeof location === 'undefined') return undefined;
    const title = document.title?.trim();
    return title ? `${title} (${location.pathname})` : location.pathname;
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseAssistantEvent(raw: string): AssistantEvent | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      name = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trim());
    }
  }
  if (data.length === 0) return null;
  try {
    return { name, data: JSON.parse(data.join('\n')) as Record<string, unknown> };
  } catch {
    return null;
  }
}
