import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menubar } from 'primeng/menubar';

import { UserSessionStore } from '@core/store/user.session';
import { GenerationBellComponent } from '../generation-bell/generation-bell.component';
import { ThemePanelComponent } from '../theme-panel/theme-panel.component';
import { SlidePillDirective } from '../slide-pill/slide-pill.directive';

@Component({
  selector: 'app-nav-bar',
  imports: [
    RouterLink,
    NgOptimizedImage,
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

  protected readonly menuItems = computed<MenuItem[]>(() => {
    const isSuperadmin = this.sessionStore.currentUser()?.role_level === 0;
    const items: MenuItem[] = [
      { label: 'Agencia', icon: 'pi pi-briefcase', routerLink: '/agency' },
      { label: 'Studio', icon: 'pi pi-bolt', routerLink: '/studio' },
      { label: 'Proyectos', icon: 'pi pi-folder', routerLink: '/projects' },
      { label: 'Eventos', icon: 'pi pi-calendar', routerLink: '/events' },
      { label: 'Video', icon: 'pi pi-video', routerLink: '/video' },
    ];
    if (isSuperadmin) {
      items.push({ label: 'Admin', icon: 'pi pi-cog', routerLink: '/admin/models' });
    }
    return items;
  });
}
