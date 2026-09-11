import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';

import { UserSessionStore } from '@core/store/user.session';
import { ThemePanelComponent } from '../theme-panel/theme-panel.component';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, ThemePanelComponent, Menubar],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarComponent {
  private readonly sessionStore = inject(UserSessionStore);
  private readonly router = inject(Router);

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const isSuperadmin = this.sessionStore.currentUser()?.role_level === 0;
    const items: MenuItem[] = [
      {
        label: 'Inicio',
        icon: 'pi pi-home',
        routerLink: '/',
        routerLinkActiveOptions: { exact: true },
      },
      { label: 'Agencia', icon: 'pi pi-briefcase', routerLink: '/agency' },
      { label: 'Eventos', icon: 'pi pi-calendar', routerLink: '/events' },
      { label: 'Video', icon: 'pi pi-video', routerLink: '/video' },
    ];
    if (isSuperadmin) {
      items.push({ label: 'Admin', icon: 'pi pi-cog', routerLink: '/admin/tenants' });
    }
    return items;
  });
}
