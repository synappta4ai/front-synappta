import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
      { value: 'models', label: 'Modelos', icon: 'md md-memory', routerLink: '/admin/models' },
      { value: 'videos', label: 'Videos', icon: 'md md-videocam', routerLink: '/admin/videos' },
      { value: 'imagens', label: 'Imágenes', icon: 'md md-image', routerLink: '/admin/imagens' },
      { value: 'logs', label: 'Logs', icon: 'md md-list', routerLink: '/admin/logs' },
    ];
    if (this.isSuperadmin()) {
      items.push({
        value: 'tenants',
        label: 'Tenants',
        icon: 'md md-business',
        routerLink: '/admin/tenants',
      });
    }
    return items;
  });

  /** Tab activo reactivo: el getter anterior quedaba stale con OnPush. */
  protected readonly activeValue = signal(this.computeActiveValue());

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.activeValue.set(this.computeActiveValue());
      }
    });
  }

  private computeActiveValue(): string {
    const url = this.router.url;
    if (url.includes('/admin/tenants')) return 'tenants';
    if (url.includes('/admin/videos')) return 'videos';
    if (url.includes('/admin/imagens')) return 'imagens';
    if (url.includes('/admin/logs')) return 'logs';
    return 'models';
  }
}
