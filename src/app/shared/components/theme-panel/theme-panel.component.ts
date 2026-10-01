import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
import { ThemeService } from '@services/theme.service';
import { ThemeMode, AccentId, ACCENTS } from '@interfaces/theme.interface';
import { AUTH } from '@constants/routes';

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
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly popover = viewChild.required<Popover>('popover');

  readonly currentUser = this.sessionStore.currentUser;
  readonly currentMode = this.themeService.currentMode;
  readonly currentAccent = this.themeService.currentAccent;
  readonly accents = ACCENTS;
  readonly currentLang = this.translate.currentLang;

  protected readonly profileVisible = signal(false);
  protected readonly settingsVisible = signal(false);

  readonly userAvatarUrl = this.buildAvatarUrl();

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

  private buildAvatarUrl(): string {
    const user = this.sessionStore.currentUser();
    const name = user ? `${user.name} ${user.surname}` : 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
  }
}
