import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '@modules/auth/services/auth.service';
import { ThemePanelComponent } from '../theme-panel/theme-panel.component';

interface NavLink {
  label: string;
  href: string;
  exact: boolean;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, ThemePanelComponent],
  templateUrl: './nav-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarComponent {
  private readonly authService = inject(AuthService);

  protected readonly allLinks: readonly NavLink[] = [
    { label: 'Inicio', href: '/', exact: true },
    { label: 'Agencia', href: '/agency', exact: false },
    { label: 'Eventos', href: '/events', exact: false },
    { label: 'Video', href: '/video', exact: false },
    { label: 'Admin', href: '/admin/tenants', exact: false, adminOnly: true },
  ];

  protected readonly menuOpen = signal(false);

  protected get links(): readonly NavLink[] {
    const isSuperadmin = this.authService.roleLevel() === 0;
    return this.allLinks.filter((link) => !link.adminOnly || isSuperadmin);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
