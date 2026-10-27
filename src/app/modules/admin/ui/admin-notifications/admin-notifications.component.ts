import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import QRCode from 'qrcode';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

import { AdminTenantService } from '../../services/admin-tenant.service';
import { AdminApiRepository } from '../../repositories/admin-api.repository';
import { NotificationChannel, NotificationChannelRequest } from '../../interfaces';
import { DevicePushService } from '@core/services/device-push.service';

/** Proveedor soportado por shoutrrr + ejemplo de URL. */
interface ServiceOption {
  value: string;
  label: string;
  example: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  { value: 'slack', label: 'Slack', example: 'slack://xoxb-token@C01234567' },
  { value: 'telegram', label: 'Telegram', example: 'telegram://bot-token@telegram?channels=@canal' },
  { value: 'discord', label: 'Discord', example: 'discord://webhook-id/webhook-token' },
  { value: 'lark', label: 'Lark', example: 'lark://webhook-url' },
  { value: 'teams', label: 'Microsoft Teams', example: 'teams://webhook-url' },
  { value: 'email', label: 'Email', example: 'smtp://usuario:clave@smtp.ejemplo.com:587/?from=aviso@ejemplo.com&to=dest@ejemplo.com' },
  { value: 'resend', label: 'Resend', example: 'resend://api-key@resend?from=aviso@ejemplo.com&to=dest@ejemplo.com' },
  { value: 'gotify', label: 'Gotify', example: 'gotify://gotify.ejemplo.com/token-app' },
  { value: 'ntfy', label: 'ntfy', example: 'https://ntfy.sh/mi-tema' },
  { value: 'mattermost', label: 'Mattermost', example: 'mattermost://usuario@mattermost.ejemplo.com/token/webhook' },
  { value: 'pushover', label: 'Pushover', example: 'pushover://token-app@token-usuario' },
  { value: 'custom', label: 'Custom', example: 'generic://host/token' },
];

/**
 * Canales de notificación del tenant: a dónde se avisa cuando un video
 * queda listo o falla. La URL secreta nunca vuelve del back (solo máscara).
 */
@Component({
  selector: 'app-admin-notifications',
  imports: [
    FormsModule,
    TranslatePipe,
    Button,
    Dialog,
    InputText,
    Select,
    TableModule,
    Tag,
    ToggleSwitch,
    Tooltip,
  ],
  templateUrl: './admin-notifications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNotificationsComponent {
  private readonly adminTenants = inject(AdminTenantService);
  private readonly repository = inject(AdminApiRepository);
  private readonly translate = inject(TranslateService);
  private readonly devicePush = inject(DevicePushService);

  protected readonly tenant = this.adminTenants.selectedTenant;

  protected readonly channels = signal<NotificationChannel[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly dialogVisible = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly formName = signal('');
  protected readonly formService = signal<string>('telegram');
  protected readonly formUrl = signal('');
  protected readonly formEnabled = signal(true);

  /** Vinculación por QR: diálogo + código de un solo uso. */
  protected readonly pairVisible = signal(false);
  protected readonly pairCode = signal<string | null>(null);
  protected readonly pairExpires = signal<string | null>(null);
  protected readonly pairQr = signal<string | null>(null);
  protected readonly pairBusy = signal(false);
  protected readonly pairError = signal<string | null>(null);

  /** Confirmación de borrado en dos pasos (id del canal pendiente). */
  protected readonly confirmDeleteId = signal<string | null>(null);
  /** Id del canal con prueba en curso. */
  protected readonly testingId = signal<string | null>(null);
  /** Pruebas de servicios nativos (push web + centro). */
  protected readonly testingPush = signal(false);
  protected readonly testingCenter = signal(false);

  protected readonly serviceOptions = SERVICE_OPTIONS;
  protected readonly editingMask = signal<string | null>(null);

  protected readonly serviceExample = computed(() => {
    const opt = SERVICE_OPTIONS.find((o) => o.value === this.formService());
    return opt ? opt.example : '';
  });

  constructor() {
    this.adminTenants.ensureLoaded();
    this.reload();
  }

  protected tenantSlug(): string | undefined {
    return this.adminTenants.selectedTenant()?.slug ?? undefined;
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.repository.listNotificationChannels(this.tenantSlug()).subscribe({
      next: (res) => {
        this.channels.set(res.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.LOAD'));
        this.loading.set(false);
      },
    });
  }

  // ─── Alta / edición ────────────────────────────────────────────

  protected openCreate(): void {
    this.editingId.set(null);
    this.editingMask.set(null);
    this.formName.set('');
    this.formService.set('telegram');
    this.formUrl.set('');
    this.formEnabled.set(true);
    this.formError.set(null);
    this.dialogVisible.set(true);
  }

  protected openEdit(channel: NotificationChannel): void {
    this.editingId.set(channel.id);
    this.editingMask.set(channel.url_mask);
    this.formName.set(channel.name);
    this.formService.set(
      SERVICE_OPTIONS.some((o) => o.value === channel.service) ? channel.service : 'custom',
    );
    this.formUrl.set('');
    this.formEnabled.set(channel.enabled);
    this.formError.set(null);
    this.dialogVisible.set(true);
  }

  protected save(): void {
    const name = this.formName().trim();
    if (!name) {
      this.formError.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.NAME_REQUIRED'));
      return;
    }
    if (!this.editingId() && !this.formUrl().trim()) {
      this.formError.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.URL_REQUIRED'));
      return;
    }
    const payload: NotificationChannelRequest = {
      name,
      service: this.formService(),
      enabled: this.formEnabled(),
    };
    const url = this.formUrl().trim();
    if (url) {
      payload.url = url;
    }
    this.saving.set(true);
    this.formError.set(null);
    const slug = this.tenantSlug();
    const done = {
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.notice.set(this.translate.instant('ADMIN.NOTIFICATIONS.SAVED'));
        setTimeout(() => this.notice.set(null), 3000);
        this.reload();
      },
      error: (err: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.formError.set(
          err?.error?.error ?? this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.SAVE'),
        );
      },
    };
    if (this.editingId()) {
      this.repository.updateNotificationChannel(this.editingId()!, payload, slug).subscribe(done);
    } else {
      this.repository.createNotificationChannel(payload, slug).subscribe(done);
    }
  }

  // ─── Habilitar / probar / borrar ───────────────────────────────

  protected toggleEnabled(channel: NotificationChannel): void {
    const slug = this.tenantSlug();
    this.repository
      .updateNotificationChannel(channel.id, { enabled: !channel.enabled }, slug)
      .subscribe({
        next: () => this.reload(),
        error: () => this.error.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.SAVE')),
      });
  }

  protected testPush(): void {
    this.testingPush.set(true);
    this.notice.set(null);
    this.repository.testPushNotifications('', this.tenantSlug()).subscribe({
      next: (res) => {
        this.testingPush.set(false);
        const n = res.data?.sent_to ?? 0;
        this.notice.set(
          n > 0
            ? this.translate.instant('ADMIN.NOTIFICATIONS.TEST_PUSH_OK', { count: n })
            : this.translate.instant('ADMIN.NOTIFICATIONS.TEST_PUSH_EMPTY'),
        );
        setTimeout(() => this.notice.set(null), 3000);
      },
      error: (err: { error?: { error?: string } }) => {
        this.testingPush.set(false);
        this.error.set(err?.error?.error ?? this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.TEST'));
      },
    });
  }

  protected testCenter(): void {
    this.testingCenter.set(true);
    this.notice.set(null);
    this.repository.testCenterNotifications('', this.tenantSlug()).subscribe({
      next: () => {
        this.testingCenter.set(false);
        this.notice.set(this.translate.instant('ADMIN.NOTIFICATIONS.TEST_CENTER_OK'));
        setTimeout(() => this.notice.set(null), 3000);
      },
      error: (err: { error?: { error?: string } }) => {
        this.testingCenter.set(false);
        this.error.set(err?.error?.error ?? this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.TEST'));
      },
    });
  }

  protected test(channel: NotificationChannel): void {
    this.testingId.set(channel.id);
    this.notice.set(null);
    this.repository.testNotificationChannel(channel.id, this.tenantSlug()).subscribe({
      next: () => {
        this.testingId.set(null);
        this.notice.set(this.translate.instant('ADMIN.NOTIFICATIONS.TEST_OK'));
        setTimeout(() => this.notice.set(null), 3000);
      },
      error: (err: { error?: { error?: string } }) => {
        this.testingId.set(null);
        this.error.set(err?.error?.error ?? this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.TEST'));
      },
    });
  }

  protected askDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  protected cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  // ─── Vincular dispositivo (QR) ─────────────────────────────

  protected openPair(): void {
    this.pairVisible.set(true);
    void this.generatePair();
  }

  protected async generatePair(): Promise<void> {
    this.pairBusy.set(true);
    this.pairError.set(null);
    this.pairQr.set(null);
    try {
      const pairing = await this.devicePush.createPairing(this.tenantSlug());
      this.pairCode.set(pairing.code);
      this.pairExpires.set(pairing.expires_at);
      const url = `${window.location.origin}/pair?code=${encodeURIComponent(pairing.code)}`;
      this.pairQr.set(await QRCode.toDataURL(url, { width: 240, margin: 2 }));
    } catch {
      this.pairError.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.PAIR'));
    } finally {
      this.pairBusy.set(false);
    }
  }

  protected confirmDelete(): void {
    const id = this.confirmDeleteId();
    if (!id) {
      return;
    }
    this.confirmDeleteId.set(null);
    this.repository.deleteNotificationChannel(id, this.tenantSlug()).subscribe({
      next: () => this.reload(),
      error: () => this.error.set(this.translate.instant('ADMIN.NOTIFICATIONS.ERRORS.DELETE')),
    });
  }
}
