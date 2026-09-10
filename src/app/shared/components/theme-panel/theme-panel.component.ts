import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Popover } from 'primeng/popover';

import { UserSessionStore } from '@core/store/user.session';
import { AuthService } from '@modules/auth/services/auth.service';
import { ThemeService } from '@services/theme.service';
import { ColorPalette, ThemeMode, COLOR_PALETTES } from '@interfaces/theme.interface';
import { AUTH } from '@constants/routes';

@Component({
  selector: 'app-theme-panel',
  imports: [Popover],
  templateUrl: './theme-panel.component.html',
  styleUrls: ['./theme-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemePanelComponent {
  private readonly themeService = inject(ThemeService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly popover = viewChild.required<Popover>('popover');

  readonly currentUser = this.sessionStore.currentUser;
  readonly currentPalette = this.themeService.currentPalette;
  readonly currentMode = this.themeService.currentMode;
  readonly palettes = COLOR_PALETTES;

  readonly userAvatarUrl = this.buildAvatarUrl();

  togglePopover(event: Event): void {
    this.popover().toggle(event);
  }

  onPaletteChange(palette: ColorPalette): void {
    this.themeService.setPalette(palette);
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
