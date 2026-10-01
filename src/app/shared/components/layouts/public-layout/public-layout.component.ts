import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CONTACT_EMAIL, CONTACT_SOCIALS } from '@constants/contact.constants';

@Component({
  selector: 'layout',
  imports: [RouterOutlet],
  templateUrl: './public-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {
  currentYear = signal(new Date().getFullYear());

  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly socials = CONTACT_SOCIALS;
}
