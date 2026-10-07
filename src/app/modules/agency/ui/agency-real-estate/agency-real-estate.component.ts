import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { AgencyService } from '../../services/agency.service';
import { Credential, CredentialProvider } from '../../interfaces';
import { UserSessionStore } from '@core/store/user.session';
import { environment } from '@env/environment';

/** Mensaje del chat con el agente DCS. */
interface AgentMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

/** Artefactos que emite el agente (shapes del server DCS). */
interface SalesAngle {
  id?: string;
  title: string;
  hook?: string;
  target_audience?: string;
  core_virtues?: string[];
  narrative_pitch?: string;
  selected?: boolean;
}

interface SalesAnglesData {
  project_name?: string;
  summary?: string;
  angles: SalesAngle[];
}

interface StoryboardBeat {
  beat_number: number;
  scene_title?: string;
  space_location?: string;
  visual_description?: string;
  suggested_shot_type?: string;
  sketch_svg?: string;
  video_prompt?: string;
}

interface StoryboardData {
  project_title?: string;
  angle_used?: string;
  visual_style?: string;
  beats: StoryboardBeat[];
}

interface ShotItem {
  id?: string;
  name?: string;
  desc?: string;
  duration?: number;
  prompt?: { en?: string };
}

interface SceneItem {
  title?: string;
  scriptLocation?: string;
  shots: ShotItem[];
}

interface ShotBreakdown {
  description?: string;
  scenes: SceneItem[];
}

/** Proveedores LLM que el asistente de agencia puede usar. */
const AGENT_PROVIDERS: CredentialProvider[] = ['openrouter', 'anthropic'];

/**
 * Flujo Inmobiliaria dentro de la Agencia: chat SSE con el agente DCS.
 *
 * Las credenciales NO se crean acá: se cargan y administra en Admin → Modelos
 * (admin/models). Este panel solo consume las credenciales configuradas del
 * tenant (las resuelve el back por request, nunca desde .env).
 */
@Component({
  selector: 'app-agency-real-estate',
  imports: [FormsModule, Button, Card, Message, Select, Tag, Textarea],
  templateUrl: './agency-real-estate.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyRealEstateComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly session = inject(UserSessionStore);

  // ─── Credenciales (solo lectura — se gestionan en Admin → Modelos) ──
  protected readonly credentials = signal<Credential[]>([]);
  /** Proveedores LLM con API key cargada en este tenant. */
  protected readonly configuredProviders = computed<CredentialProvider[]>(() =>
    this.credentials()
      .filter((c) => AGENT_PROVIDERS.includes(c.provider) && !!c.api_key_mask)
      .map((c) => c.provider),
  );
  protected readonly provider = signal<CredentialProvider>('openrouter');
  protected readonly providerReady = computed(() =>
    this.configuredProviders().includes(this.provider()),
  );
  protected readonly providerOptions = computed(() =>
    this.configuredProviders().map((p) => ({ label: p, value: p })),
  );
  protected readonly selectedCredential = computed(
    () => this.credentials().find((c) => c.provider === this.provider()) ?? null,
  );

  // ─── Chat del flujo ─────────────────────────────────────────────
  protected readonly messages = signal<AgentMessage[]>([]);
  protected readonly draft = signal('');
  protected readonly streaming = signal(false);
  protected readonly stepLabel = signal('');
  protected readonly conversationId = signal<string | null>(null);

  protected readonly salesAngles = signal<SalesAnglesData | null>(null);
  protected readonly storyboard = signal<StoryboardData | null>(null);
  protected readonly shots = signal<ShotBreakdown | null>(null);

  protected readonly shotCount = computed(() =>
    (this.shots()?.scenes ?? []).reduce((n, s) => n + (s.shots?.length ?? 0), 0),
  );

  protected readonly canSend = computed(
    () => !!this.draft().trim() && this.providerReady() && !this.streaming(),
  );

  constructor() {
    this.loadCredentials();
  }

  // ─── Credenciales (lectura) ─────────────────────────────────────

  protected loadCredentials(): void {
    this.agencyService.listCredentials().subscribe({
      next: (creds) => this.applyCredentials(creds ?? []),
      error: () => this.applyCredentials([]),
    });
  }

  private applyCredentials(creds: Credential[]): void {
    this.credentials.set(creds);
    const configured = creds.filter(
      (c) => AGENT_PROVIDERS.includes(c.provider) && !!c.api_key_mask,
    );
    // El provider del chat apunta siempre a una credencial configurada.
    if (configured.length > 0 && !configured.some((c) => c.provider === this.provider())) {
      this.provider.set(configured[0].provider);
    }
  }

  /** Modelo del asistente configurado en Admin → Modelos (solo lectura acá). */
  protected modelOf(cred: Credential): string {
    try {
      const extra = JSON.parse(cred.extra ?? '{}') as { model?: string };
      return extra.model ?? '';
    } catch {
      return '';
    }
  }

  // ─── Chat SSE ───────────────────────────────────────────────────

  protected async send(): Promise<void> {
    const message = this.draft().trim();
    if (!message || this.streaming() || !this.providerReady()) {
      return;
    }
    this.messages.update((m) => [...m, { role: 'user', content: message }]);
    this.draft.set('');
    this.streaming.set(true);
    if (!this.stepLabel()) {
      this.stepLabel.set('Analizando la información…');
    }

    try {
      const token = this.session.token();
      const res = await fetch(`${environment.API_URL}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: this.conversationId() ?? '',
          message,
          provider: this.provider(),
          workflow: 'real_estate',
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text();
        this.pushError(`Error del servidor (${res.status}): ${detail}`);
        return;
      }

      this.messages.update((m) => [...m, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          if (raw.trim()) {
            this.handleEvent(raw);
          }
        }
      }
    } catch (err) {
      this.pushError(`Error de conexión: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.streaming.set(false);
    }
  }

  private handleEvent(raw: string): void {
    try {
      const [eventLine, dataLine] = raw.split('\n');
      const name = eventLine?.replace('event: ', '') ?? '';
      const data = JSON.parse(dataLine?.replace('data: ', '') ?? '{}') as Record<string, unknown>;
      switch (name) {
        case 'meta':
          if (typeof data['conversation_id'] === 'string') {
            this.conversationId.set(data['conversation_id']);
          }
          break;
        case 'text':
          this.appendText(String((data as { text?: string }).text ?? ''));
          break;
        case 'error':
          this.pushError(String((data as { message?: string }).message ?? 'Error desconocido del agente'));
          break;
        case 'sales_angles':
          this.salesAngles.set(data as unknown as SalesAnglesData);
          this.stepLabel.set('Ángulos de venta');
          break;
        case 'storyboard':
          this.storyboard.set(data as unknown as StoryboardData);
          this.stepLabel.set('Storyboard visual');
          break;
        case 'element_registry':
          this.stepLabel.set('Galería & espacios');
          break;
        case 'shot_breakdown':
          this.shots.set(data as unknown as ShotBreakdown);
          this.stepLabel.set('Shots & prompts');
          break;
        default:
          break;
      }
    } catch {
      // Evento SSE incompleto: se ignora (el buffer conserva el resto).
    }
  }

  private appendText(text: string): void {
    this.messages.update((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant') {
        return [...m.slice(0, -1), { ...last, content: last.content + text }];
      }
      return [...m, { role: 'assistant', content: text }];
    });
  }

  private pushError(message: string): void {
    this.messages.update((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant' && !last.content) {
        return [...m.slice(0, -1), { role: 'error', content: message }];
      }
      return [...m, { role: 'error', content: message }];
    });
  }
}
