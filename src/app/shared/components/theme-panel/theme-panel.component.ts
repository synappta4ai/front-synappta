import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Popover } from 'primeng/popover';
import { Tooltip } from 'primeng/tooltip';
import { Dialog } from 'primeng/dialog';
import { Button } from 'primeng/button';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UserSessionStore } from '@core/store/user.session';
import { AuthService } from '@modules/auth/services/auth.service';
import { UpdateAvatarRequest } from '@modules/auth/interfaces';
import { LibraryService } from '@modules/library/services';
import { ThemeService } from '@services/theme.service';
import { NotificationsPreferencesService } from '@core/services/notifications-preferences.service';
import { DevicePushService } from '@core/services/device-push.service';
import { LanguageService, AppLang } from '@services/language.service';
import { ThemeMode, AccentId, ACCENTS } from '@interfaces/theme.interface';
import { AUTH } from '@constants/routes';
import { environment } from '@env/environment';

/** Tamaño máximo de la foto de perfil: 5 MB. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-theme-panel',
  imports: [FormsModule, Popover, Tooltip, Dialog, Button, ToggleSwitch, TranslatePipe],
  templateUrl: './theme-panel.component.html',
  styleUrls: ['./theme-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePanelComponent {
  private readonly themeService = inject(ThemeService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly authService = inject(AuthService);
  private readonly libraryService = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly notificationsPrefs = inject(NotificationsPreferencesService);
  protected readonly devicePush = inject(DevicePushService);

  protected readonly popover = viewChild.required<Popover>('popover');
  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  readonly currentUser = this.sessionStore.currentUser;
  readonly currentMode = this.themeService.currentMode;
  readonly currentAccent = this.themeService.currentAccent;
  readonly accents = ACCENTS;
  readonly currentLang = this.languageService.currentLang;
  readonly notificationsEnabled = this.notificationsPrefs.enabled;

  /** Key i18n del nombre del acento (los nombres viven en core/interfaces). */
  protected accentKey(id: AccentId): string {
    return `SHARED.THEME_PANEL.ACCENT_${id.toUpperCase()}`;
  }

  protected readonly profileVisible = signal(false);
  protected readonly settingsVisible = signal(false);

  // ─── Foto de perfil ─────────────────────────────────────────
  protected readonly avatarUploading = signal(false);
  protected readonly avatarError = signal('');
  private readonly avatarLoadFailed = signal(false);

  readonly VERSION = environment.APP_VERSION;

  /** URL del avatar: foto del usuario si la hay; iniciales como fallback. */
  readonly userAvatarUrl = computed(() => {
    if (this.avatarLoadFailed()) {
      return this.buildFallbackAvatarUrl();
    }
    const url = this.currentUser()?.avatar_url;
    return url ? url : this.buildFallbackAvatarUrl();
  });

  protected readonly hasCustomAvatar = computed(() => !!this.currentUser()?.avatar_file_id);

  togglePopover(event: Event): void {
    this.popover().toggle(event);
  }

  protected openProfile(): void {
    this.popover().hide();
    this.profileVisible.set(true);
  }

  protected openSettings(): void {
    this.popover().hide();
    this.settingsVisible.set(true);
  }

  protected setLang(lang: AppLang): void {
    this.languageService.setLang(lang);
  }

  /** Los avisos requieren el dispositivo activo (orden: dispositivo → avisos). */
  protected canToggleVideo(): boolean {
    if (!this.devicePush.supported()) {
      return true;
    }
    return this.devicePush.subscribed();
  }

  toggleNotifications(): void {
    if (!this.canToggleVideo()) {
      return;
    }
    this.notificationsPrefs.setEnabled(!this.notificationsPrefs.enabled());
  }

  toggleDevicePush(): void {
    if (this.devicePush.busy()) {
      return;
    }
    if (this.devicePush.subscribed()) {
      void this.devicePush.unsubscribe();
    } else {
      void this.devicePush.subscribe();
    }
  }

  devicePushError(): string | null {
    const key = this.devicePush.error();
    return key ? this.translate.instant(key) : null;
  }

  onAccentChange(accent: AccentId): void {
    this.themeService.setAccent(accent);
  }

  onModeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  onLogout(): void {
    this.popover().hide();
    this.authService.logout();
    void this.router.navigate([AUTH.ROOT, AUTH.LOGIN]);
  }

  // ─── Cambio de foto de perfil ───────────────────────────────

  protected triggerAvatarSelect(): void {
    if (this.avatarUploading()) {
      return;
    }
    this.avatarError.set('');
    this.avatarInput()?.nativeElement.click();
  }

  protected onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.avatarError.set(this.translate.instant('SHARED.THEME_PANEL.ERROR_PICK_IMAGE'));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.avatarError.set(this.translate.instant('SHARED.THEME_PANEL.ERROR_IMAGE_TOO_BIG'));
      return;
    }
    this.uploadAvatar(file);
  }

  private uploadAvatar(file: File): void {
    this.avatarUploading.set(true);
    this.avatarError.set('');
    this.libraryService.uploadFile(file, 'images').subscribe({
      next: (asset) => {
        const payload: UpdateAvatarRequest = {
          avatar_file_id: asset.id,
          avatar_url: asset.url ?? '',
        };
        this.authService.updateAvatar(payload).subscribe({
          next: () => {
            this.avatarUploading.set(false);
            this.avatarLoadFailed.set(false);
          },
          error: (err: unknown) => {
            this.avatarUploading.set(false);
            this.avatarError.set(
              this.describeError(
                err,
                this.translate.instant('SHARED.THEME_PANEL.ERROR_SAVE_PHOTO'),
              ),
            );
          },
        });
      },
      error: (err: unknown) => {
        this.avatarUploading.set(false);
        this.avatarError.set(
          this.describeError(err, this.translate.instant('SHARED.THEME_PANEL.ERROR_UPLOAD_PHOTO')),
        );
      },
    });
  }

  protected removeAvatar(): void {
    if (this.avatarUploading()) {
      return;
    }
    this.avatarUploading.set(true);
    this.avatarError.set('');
    this.authService.updateAvatar({}).subscribe({
      next: () => {
        this.avatarUploading.set(false);
        this.avatarLoadFailed.set(false);
      },
      error: (err: unknown) => {
        this.avatarUploading.set(false);
        this.avatarError.set(
          this.describeError(err, this.translate.instant('SHARED.THEME_PANEL.ERROR_REMOVE_PHOTO')),
        );
      },
    });
  }

  protected onAvatarLoadError(): void {
    this.avatarLoadFailed.set(true);
  }

  private describeError(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) {
      return `${fallback} ${err.message}`;
    }
    return fallback;
  }

  private buildFallbackAvatarUrl(): string {
    const user = this.currentUser();
    const name = user ? `${user.name} ${user.surname}` : 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
  }
}
