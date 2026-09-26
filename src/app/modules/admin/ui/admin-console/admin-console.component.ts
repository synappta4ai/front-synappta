import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Tabs, Tab, TabList } from 'primeng/tabs';

import { UserSessionStore } from '@core/store/user.session';
import { PageContainerComponent } from '@shared/components/index';

@Component({
  selector: 'app-admin-console',
  imports: [Tabs, Tab, TabList, RouterLink, RouterOutlet, PageContainerComponent],
  templateUrl: './admin-console.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConsoleComponent {
  private readonly sessionStore = inject(UserSessionStore);
  protected readonly router = inject(Router);

  /** true si el usuario actual es superadmin de plataforma (role_level 0). */
  protected readonly isSuperadmin = computed(
    () => this.sessionStore.currentUser()?.role_level === 0,
  );

  protected readonly tabItems = computed(() => {
    const items = [
      { value: 'models', label: 'Modelos', icon: 'pi pi-microchip', routerLink: '/admin/models' },
      { value: 'videos', label: 'Videos', icon: 'pi pi-video', routerLink: '/admin/videos' },
      { value: 'logs', label: 'Logs', icon: 'pi pi-list', routerLink: '/admin/logs' },
    ];
    if (this.isSuperadmin()) {
      items.push({
        value: 'tenants',
        label: 'Tenants',
        icon: 'pi pi-building',
        routerLink: '/admin/tenants',
      });
    }
    return items;
  });

  protected get activeValue(): string {
    const url = this.router.url;
    if (url.includes('/admin/tenants')) return 'tenants';
    if (url.includes('/admin/videos')) return 'videos';
    if (url.includes('/admin/logs')) return 'logs';
    return 'models';
  }
}
