import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CONTACT_EMAIL } from '@constants/contact.constants';
import { RevealDirective } from '@shared/components/reveal/reveal.directive';
import { HeroCarouselComponent } from '../hero-carousel/hero-carousel.component';
import { HERO_SLIDES } from '../hero-carousel/hero-slides';

@Component({
  selector: 'app-home',
  imports: [RouterLink, HeroCarouselComponent, RevealDirective],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  /**
   * Entrada real de la app. NO existe ruta de registro: apunta al login.
   * PARA CAMBIARLA cuando se cree el registro, editar solo esta línea.
   */
  protected readonly registerUrl = '/auth/login';
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly slides = HERO_SLIDES;
}
