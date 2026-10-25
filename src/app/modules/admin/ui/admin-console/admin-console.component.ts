import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menubar } from 'primeng/menubar';
import { Select } from 'primeng/select';
import { Tooltip } from 'primeng/tooltip';

import { AdminTenantService } from '../../services/admin-tenant.service';

/** Secciones de la consola, agrupadas por tema en el menubar. */
@Component({
  selector: 'app-admin-console',
  imports: [FormsModule, RouterOutlet, Button, Menubar, Select, Tooltip, TranslatePipe],
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

  protected readonly showMenubar = computed(() => this.selectedTenantId() !== null);

  protected readonly menuItems = computed<MenuItem[]>(() => {
    // currentLang() dentro del computed re-evalúa las etiquetas al cambiar idioma.
    this.translate.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    const soon = t('ADMIN.CONSOLE.MENU_SOON');

    return [
      {
        label: t('ADMIN.CONSOLE.MENU_MODELS'),
        icon: 'md md-memory',
        routerLink: '/admin/models',
        routerLinkActiveOptions: { exact: true },
      },
      {
        label: t('ADMIN.CONSOLE.MENU_MASTER'),
        icon: 'md md-star',
        routerLink: '/admin/maestro',
        routerLinkActiveOptions: { exact: true },
      },
      {
        label: t('ADMIN.CONSOLE.MENU_PROVIDERS'),
        icon: 'md md-dashboard',
        disabled: true,
        title: soon,
      },
      { separator: true },
      {
        label: t('ADMIN.CONSOLE.MENU_VIDEOS'),
        icon: 'md md-videocam',
        routerLink: '/admin/videos',
      },
      {
        label: t('ADMIN.CONSOLE.MENU_IMAGES'),
        icon: 'md md-image',
        routerLink: '/admin/imagenes',
      },
      { separator: true },
      {
        label: t('ADMIN.CONSOLE.MENU_LOGS'),
        icon: 'md md-list',
        routerLink: '/admin/logs',
      },
      {
        label: t('ADMIN.CONSOLE.MENU_GPU'),
        icon: 'md md-desktop_windows',
        routerLink: '/admin/gpu',
      },
      { separator: true },
      {
        label: t('ADMIN.CONSOLE.MENU_USERS'),
        icon: 'md md-people',
        routerLink: '/admin/users',
      },
      {
        label: t('ADMIN.CONSOLE.MENU_BUCKET'),
        icon: 'md md-storage',
        routerLink: '/admin/bucket',
      },
      {
        label: t('ADMIN.CONSOLE.MENU_DRIVE'),
        icon: 'md md-folder_open',
        disabled: true,
        title: soon,
      },
    ];
  });

  constructor() {
    this.adminTenants.ensureLoaded();

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.isTenantsRoute.set(this.router.url.includes('/admin/tenants'));
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
