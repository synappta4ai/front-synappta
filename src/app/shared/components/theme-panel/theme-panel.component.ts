import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Popover } from 'primeng/popover';
import { Tooltip } from 'primeng/tooltip';
import { Dialog } from 'primeng/dialog';
import { Button } from 'primeng/button';
import { TranslateService } from '@ngx-translate/core';

import { UserSessionStore } from '@core/store/user.session';
import { AuthService } from '@modules/auth/services/auth.service';
import { UpdateAvatarRequest } from '@modules/auth/interfaces';
import { LibraryService } from '@modules/library/services';
import { ThemeService } from '@services/theme.service';
import { ThemeMode, AccentId, ACCENTS } from '@interfaces/theme.interface';
import { AUTH } from '@constants/routes';

/** Tamaño máximo de la foto de perfil: 5 MB. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-theme-panel',
  imports: [Popover, Tooltip, Dialog, Button],
  templateUrl: './theme-panel.component.html',
  styleUrls: ['./theme-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePanelComponent implements OnInit {
  private readonly themeService = inject(ThemeService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly authService = inject(AuthService);
  private readonly libraryService = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly popover = viewChild.required<Popover>('popover');
  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>('avatarInput');

  readonly currentUser = this.sessionStore.currentUser;
  readonly currentMode = this.themeService.currentMode;
  readonly currentAccent = this.themeService.currentAccent;
  readonly accents = ACCENTS;
  readonly currentLang = this.translate.currentLang;

  protected readonly profileVisible = signal(false);
  protected readonly settingsVisible = signal(false);

  // ─── Foto de perfil ─────────────────────────────────────────
  protected readonly avatarUploading = signal(false);
  protected readonly avatarError = signal('');
  private readonly avatarLoadFailed = signal(false);

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

  ngOnInit(): void {
    try {
      const lang = localStorage.getItem('app-lang');
      if (lang === 'es' || lang === 'en') {
        this.translate.use(lang).subscribe();
      }
    } catch {
      // Sin almacenamiento o SSR: se mantiene el idioma por defecto.
    }
  }

  protected openProfile(): void {
    this.popover().hide();
    this.profileVisible.set(true);
  }

  protected openSettings(): void {
    this.popover().hide();
    this.settingsVisible.set(true);
  }

  protected setLang(lang: 'es' | 'en'): void {
    this.translate.use(lang).subscribe();
    try {
      localStorage.setItem('app-lang', lang);
    } catch {
      // Sin almacenamiento: el idioma vive solo en la sesión.
    }
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
      this.avatarError.set('Selecciona un archivo de imagen.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.avatarError.set('La imagen no puede superar los 5 MB.');
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
            this.avatarError.set(this.describeError(err, 'No se pudo guardar la foto.'));
          },
        });
      },
      error: (err: unknown) => {
        this.avatarUploading.set(false);
        this.avatarError.set(this.describeError(err, 'No se pudo subir la imagen.'));
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
        this.avatarError.set(this.describeError(err, 'No se pudo quitar la foto.'));
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
