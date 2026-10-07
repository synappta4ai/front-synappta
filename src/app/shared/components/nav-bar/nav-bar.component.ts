import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';

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
  ],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarComponent {
  private readonly sessionStore = inject(UserSessionStore);
  private readonly router = inject(Router);

  /** Foto del usuario para el logo cuadrado del start; null → logo por defecto. */
  protected readonly navAvatarUrl = computed(() => {
    const url = this.sessionStore.currentUser()?.avatar_url;
    return url ? url : null;
  });

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const isSuperadmin = this.sessionStore.currentUser()?.role_level === 0;
    const items: MenuItem[] = [
      { label: 'Agencia', icon: 'md md-work', routerLink: '/agency' },
      { label: 'Studio', icon: 'md md-bolt', routerLink: '/studio' },
      { label: 'Proyectos', icon: 'md md-folder', routerLink: '/projects' },
      { label: 'Recursos', icon: 'md md-photo_library', routerLink: '/resources' },
      { label: 'Mis generaciones', icon: 'md md-movie', routerLink: '/my-generations' },
      // { label: 'Eventos', icon: 'md md-calendar_month', routerLink: '/events' },
      // { label: 'Video', icon: 'md md-videocam', routerLink: '/video' },
    ];
    if (isSuperadmin) {
      items.push({ label: 'Admin', icon: 'md md-settings', routerLink: '/admin/models' });
    }
    return items;
  });
}
