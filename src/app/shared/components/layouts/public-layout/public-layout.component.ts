import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
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

  currentYear = signal(new Date().getFullYear());

  readonly currentLang = this.languageService.currentLang;

  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly socials = CONTACT_SOCIALS;

  protected setLang(lang: AppLang): void {
    this.languageService.setLang(lang);
  }
}
