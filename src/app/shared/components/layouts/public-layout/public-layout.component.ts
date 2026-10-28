import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';

import { CONTACT_EMAIL, CONTACT_SOCIALS } from '@constants/contact.constants';
import { LanguageService, AppLang } from '@services/language.service';
import { CookieBannerComponent } from '@shared/components/cookie-banner/cookie-banner.component';

@Component({
  selector: 'layout',
  imports: [RouterLink, RouterOutlet, CookieBannerComponent, TranslatePipe],
  templateUrl: './public-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);

  /** La portada no lleva el footer: cierra con su propio bloque amarillo. */
  protected readonly isHome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects === '/'),
      startWith(this.router.url === '/'),
    ),
    { initialValue: this.router.url === '/' },
  );

  currentYear = signal(new Date().getFullYear());

  readonly currentLang = this.languageService.currentLang;

  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly socials = CONTACT_SOCIALS;

  protected setLang(lang: AppLang): void {
    this.languageService.setLang(lang);
  }
}
