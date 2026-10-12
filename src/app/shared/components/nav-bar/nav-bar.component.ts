import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { UserSessionStore } from '@core/store/user.session';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { GenerationBellComponent } from '../generation-bell/generation-bell.component';
import { ThemePanelComponent } from '../theme-panel/theme-panel.component';
import { SlidePillDirective } from '../slide-pill/slide-pill.directive';

@Component({
  selector: 'app-nav-bar',
  imports: [
    RouterLink,
    NgOptimizedImage,
    ServerUrlPipe,
    GenerationBellComponent,
    ThemePanelComponent,
    Menubar,
    SlidePillDirective,
    TranslatePipe,
  ],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarComponent {
  private readonly sessionStore = inject(UserSessionStore);
  private readonly translate = inject(TranslateService);

  /** Foto del usuario para el logo cuadrado del start; null → logo por defecto. */
  protected readonly navAvatarUrl = computed(() => {
    const url = this.sessionStore.currentUser()?.avatar_url;
    return url ? url : null;
  });

  protected readonly menuItems = computed<MenuItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    const isSuperadmin = this.sessionStore.currentUser()?.role_level === 0;
    const items: MenuItem[] = [
      { label: t('APP.ROUTES.AGENCY'), icon: 'md md-work', routerLink: '/agency' },
      { label: t('APP.ROUTES.STUDIO'), icon: 'md md-bolt', routerLink: '/studio' },
      { label: t('APP.ROUTES.PROJECTS'), icon: 'md md-folder', routerLink: '/projects' },
      { label: t('APP.ROUTES.RESOURCES'), icon: 'md md-photo_library', routerLink: '/resources' },
      { label: t('APP.ROUTES.MY_GENERATIONS'), icon: 'md md-movie', routerLink: '/my-generations' },
    ];
    if (isSuperadmin) {
      items.push({
        label: t('APP.ROUTES.ADMIN'),
        icon: 'md md-settings',
        routerLink: '/admin/models',
      });
    }
    return items;
  });
}
