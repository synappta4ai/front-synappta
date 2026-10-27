import { afterNextRender, ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, DOCUMENT, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';

import { AdminTenantService } from '../../services/admin-tenant.service';

/** Segmento de la consola, agrupado por pestañas. */
export interface TabItem {
  label: string;
  route: string;
  icon: string;
  disabled?: boolean;
  title?: string;
}
@Component({
  selector: 'app-admin-console',
  imports: [FormsModule, RouterOutlet, Button, InputText, TableModule, TabsModule, Select, Tooltip, TranslatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './admin-console.component.html',
  styleUrls: ['./admin-console.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConsoleComponent {
  private readonly adminTenants = inject(AdminTenantService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSuperadmin = this.adminTenants.isSuperadmin;
  protected readonly selectedTenantId = this.adminTenants.selectedTenantId;
  protected readonly tenantOptions = this.adminTenants.tenantOptions;
  protected readonly loadingTenants = this.adminTenants.loading;

  protected readonly isTenantsRoute = signal(this.router.url.includes('/admin/tenants'));

  /** Alto exacto de la consola: viewport menos la navbar, sin scroll de página. */
  protected readonly shellHeight = signal<number | null>(null);

  /** Posición activa de la pestaña (índice en `tabs`). */
  protected readonly activeTabIndex = signal(0);

  /** Pestañas visibles, filtradas por rol: la superadmin verá todo; el tenant admin
   *  (role ≤ 1) solo GPU y modelos. */
  protected readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string): string => this.translate.instant(key);

    const isSuperadmin = this.adminTenants.isSuperadmin();
    const roleLevel = isSuperadmin ? 0 : 1;

    const baseTabs: TabItem[] = [
      { label: t('ADMIN.CONSOLE.MENU_LOGS'), route: '/admin/logs', icon: 'md md-list' },
      { label: t('ADMIN.CONSOLE.MENU_MODELS'), route: '/admin/models', icon: 'md md-memory' },
      { label: t('ADMIN.CONSOLE.MENU_MASTER'), route: '/admin/maestro', icon: 'md md-star' },
      { label: t('ADMIN.CONSOLE.MENU_PROVIDERS'), route: '/admin/providers', icon: 'md md-dashboard', disabled: true, title: t('ADMIN.CONSOLE.MENU_SOON') },
      { label: t('ADMIN.CONSOLE.MENU_VIDEOS'), route: '/admin/videos', icon: 'md md-videocam' },
      { label: t('ADMIN.CONSOLE.MENU_IMAGES'), route: '/admin/imagenes', icon: 'md md-image' },
      { label: t('ADMIN.CONSOLE.MENU_GPU'), route: '/admin/gpu', icon: 'md md-desktop_windows' },
      { label: t('ADMIN.CONSOLE.MENU_USERS'), route: '/admin/users', icon: 'md md-people' },
      { label: t('ADMIN.CONSOLE.MENU_BUCKET'), route: '/admin/bucket', icon: 'md md-storage' },
      { label: t('ADMIN.CONSOLE.MENU_DRIVE'), route: '/admin/drive', icon: 'md md-folder_open', disabled: true, title: t('ADMIN.CONSOLE.MENU_SOON') },
    ];

    if (roleLevel <= 1) {
      // role ≤ 1: solo GPU y modelos (y sus secciones propias).
      return baseTabs.filter((tab) => tab.route === '/admin/models' || tab.route === '/admin/gpu');
    }
    return baseTabs;
  });

  constructor() {
    this.adminTenants.ensureLoaded();

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.isTenantsRoute.set(this.router.url.includes('/admin/tenants'));
        // Sincroniza la pestaña activa con la ruta actual.
        const route = this.router.url.split('?')[0];
        const tab = this.tabs().find((tab: TabItem) => route === tab.route);
        if (tab) {
          this.activeTabIndex.set(this.tabs().indexOf(tab));
        }
      }
    });

    afterNextRender(() => this.trackViewport());
  }

  protected onTenantChange(tenantId: number | null): void {
    this.adminTenants.select(tenantId);
    if (tenantId !== null && this.isTenantsRoute()) {
      void this.router.navigate(['/admin/models']);
    }
  }

  protected goToTenants(): void {
    void this.router.navigate(['/admin/tenants']);
  }

  protected onTabChange(event: any): void {
    const index = typeof event === 'number' ? event : event.index;
    const tab = this.tabs()[index];
    if (tab) {
      void this.router.navigate([tab.route]);
    }
  }

  private trackViewport(): void {
    const nav = this.document.querySelector<HTMLElement>('app-nav-bar header');
    const win = this.document.defaultView;

    const measure = (): void => {
      const navHeight = nav?.getBoundingClientRect().height ?? 0;
      const viewport = win?.innerHeight ?? 0;
      this.shellHeight.set(Math.max(Math.round(viewport - navHeight), 420));
    };

    measure();
    const observer = nav ? new ResizeObserver(measure) : null;
    if (nav && observer) {
      observer.observe(nav);
    }
    win?.addEventListener('resize', measure);

    this.destroyRef.onDestroy(() => {
      observer?.disconnect();
      win?.removeEventListener('resize', measure);
    });
  }
}
