import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MenuItem } from 'primeng/api';
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
    // "Tu GPU": emparejamiento de GPUs — accesible para admins del tenant
    // (el back aplica RequireRole(1) en esos endpoints).
    const isTenantAdmin = roleLevel !== undefined && roleLevel !== null && roleLevel <= 1;
    const items: MenuItem[] = [
      { label: t('APP.ROUTES.AGENCY'), icon: 'md md-work', routerLink: '/agency' },
      { label: t('APP.ROUTES.STUDIO'), icon: 'md md-bolt', routerLink: '/studio' },
      { label: t('APP.ROUTES.PROJECTS'), icon: 'md md-folder', routerLink: '/projects' },
      { label: t('APP.ROUTES.RESOURCES'), icon: 'md md-photo_library', routerLink: '/resources' },
      { label: t('APP.ROUTES.MY_GENERATIONS'), icon: 'md md-movie', routerLink: '/my-generations' },
      {
        label: t('APP.ROUTES.TOOLS'),
        icon: 'md md-auto_fix_high',
        command: (event) => this.toggleTools(event.originalEvent),
      },
    ];
    if (isTenantAdmin) {
      items.push({
        label: t('APP.ROUTES.GPU'),
        icon: 'md md-memory',
        routerLink: '/gpu',
      });
    }
    if (isSuperadmin) {
      items.push({
        label: t('APP.ROUTES.ADMIN'),
        icon: 'md md-settings',
        routerLink: '/admin/models',
      });
    }
    return items;
  });

  protected toggleTools(event?: Event): void {
    if (event) {
      this.toolsPopover()?.toggle(event);
    }
  }

  protected hideTools(): void {
    this.toolsPopover()?.hide();
  }
}
