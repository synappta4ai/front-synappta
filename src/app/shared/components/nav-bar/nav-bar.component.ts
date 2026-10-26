import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuItem, MenuItemCommandEvent } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Popover } from 'primeng/popover';
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
    RouterLinkActive,
    NgOptimizedImage,
    ServerUrlPipe,
    GenerationBellComponent,
    ThemePanelComponent,
    Menubar,
    Popover,
    SlidePillDirective,
    TranslatePipe,
  ],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarComponent {
  private readonly sessionStore = inject(UserSessionStore);
  private readonly translate = inject(TranslateService);
  private readonly toolsPopover = viewChild<Popover>('toolsPopover');

  /** Herramientas del cliente (popover HERRAMIENTAS; se amplía sin tocar el back). */
  protected readonly toolItems = computed(() => {
    this.translate.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    return [
      {
        label: t('TOOLS.POSE_SHEET'),
        description: t('TOOLS.POSE_SHEET_DESC'),
        icon: 'md md-person',
        routerLink: '/tools/pose-sheet',
      },
      {
        label: t('TOOLS.LOCATION'),
        description: t('TOOLS.LOCATION_DESC'),
        icon: 'md md-place',
        routerLink: '/tools/location',
      },
      {
        label: t('TOOLS.STORYBOARD'),
        description: t('TOOLS.STORYBOARD_DESC'),
        icon: 'md md-movie',
        routerLink: '/tools/storyboard',
      },
    ];
  });

  /** Foto del usuario para el logo cuadrado del start; null → logo por defecto. */
  protected readonly navAvatarUrl = computed(() => {
    const url = this.sessionStore.currentUser()?.avatar_url;
    return url ? url : null;
  });

  protected readonly menuItems = computed<MenuItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string): string => this.translate.instant(key);
    const roleLevel = this.sessionStore.currentUser()?.role_level;
    const isSuperadmin = roleLevel === 0;
    const isTenantAdmin = roleLevel !== undefined && roleLevel !== null && roleLevel <= 1;

    // Secciones de la consola Admin, agrupadas bajo el menú /admin.
    const adminItems: MenuItem[] = [
      { label: t('ADMIN.CONSOLE.MENU_MODELS'), icon: 'md md-memory', routerLink: '/admin/models' },
      { label: t('ADMIN.CONSOLE.MENU_MASTER'), icon: 'md md-star', routerLink: '/admin/maestro' },
      { label: t('ADMIN.CONSOLE.MENU_VIDEOS'), icon: 'md md-videocam', routerLink: '/admin/videos' },
      { label: t('ADMIN.CONSOLE.MENU_IMAGES'), icon: 'md md-image', routerLink: '/admin/imagenes' },
      { label: t('ADMIN.CONSOLE.MENU_LOGS'), icon: 'md md-list', routerLink: '/admin/logs' },
      {
        label: t('ADMIN.CONSOLE.MENU_GPU'),
        icon: 'md md-desktop_windows',
        routerLink: '/admin/gpu',
      },
      { label: t('ADMIN.CONSOLE.MENU_USERS'), icon: 'md md-people', routerLink: '/admin/users' },
      { label: t('ADMIN.CONSOLE.MENU_BUCKET'), icon: 'md md-storage', routerLink: '/admin/bucket' },
      { label: t('ADMIN.CONSOLE.MENU_TENANTS'), icon: 'md md-business', routerLink: '/admin/tenants' },
    ];

    // Sub-items del menú de herramientas (popover HERRAMIENTAS; se amplía sin tocar el back).
    // Nota: solo toolItems alimenta el popover; no duplicar la lista acá.

    return [
      { label: t('APP.ROUTES.AGENCY'), icon: 'md md-work', routerLink: '/agency' },
      { label: t('APP.ROUTES.STUDIO'), icon: 'md md-bolt', routerLink: '/studio' },
      { label: t('APP.ROUTES.PROJECTS'), icon: 'md md-folder', routerLink: '/projects' },
      { label: t('APP.ROUTES.RESOURCES'), icon: 'md md-photo_library', routerLink: '/resources' },
      { label: t('APP.ROUTES.MY_GENERATIONS'), icon: 'md md-movie', routerLink: '/my-generations' },
      {
        label: t('TOOLS.TITLE'),
        icon: 'md md-auto_fix_high',
        // PrimeNG entrega MenuItemCommandEvent ({ originalEvent, item }), no el
        // evento DOM: el popover necesita el originalEvent para anclarse y no
        // romper su listener de click (TypeError: reading 'contains').
        command: (event: MenuItemCommandEvent) => {
          event.originalEvent?.preventDefault?.();
          this.toggleTools(event.originalEvent);
        },
      },
      {
        label: t('ADMIN.CONSOLE.MENU_TITLE'),
        icon: 'md md-settings',
        routerLink: '/admin',
        routerLinkActiveOptions: { exact: false },
        items: adminItems,
      },
    ];
  });

  protected toggleTools(event?: Event): void {
    if (event) {
      event.stopPropagation?.();
      this.toolsPopover()?.toggle(event);
    }
  }

  protected hideTools(): void {
    this.toolsPopover()?.hide();
  }
}
