import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';

const COOKIE_CONSENT_KEY = 'cookie-consent';

interface CookieConsent {
  readonly necessary: true;
  readonly analytics: boolean;
  readonly marketing: boolean;
}

/**
 * Banner de cookies: informa el uso real (hoy cero cookies, solo
 * almacenamiento funcional) y guarda preferencias granulares para las
 * categorías no esenciales que puedan sumarse a futuro.
 */
@Component({
  selector: 'cookie-banner',
  imports: [FormsModule, RouterLink, Button, Checkbox, TranslatePipe],
  templateUrl: './cookie-banner.component.html',
  styleUrl: './cookie-banner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookieBannerComponent {
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly visible = signal(false);
  protected readonly expanded = signal(false);
  protected readonly analytics = signal(false);
  protected readonly marketing = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      if (!localStorage.getItem(COOKIE_CONSENT_KEY)) {
        this.visible.set(true);
      }
    } catch {
      // Sin almacenamiento: no se insiste.
    }
  }

  protected acceptAll(): void {
    this.analytics.set(true);
    this.marketing.set(true);
    this.save();
  }

  protected acceptNecessary(): void {
    this.analytics.set(false);
    this.marketing.set(false);
    this.save();
  }

  protected saveCustom(): void {
    this.save();
  }

  private save(): void {
    const consent: CookieConsent = {
      necessary: true,
      analytics: this.analytics(),
      marketing: this.marketing(),
    };
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // Sin almacenamiento: igual se oculta en esta sesión.
    }
    this.visible.set(false);
  }
}
