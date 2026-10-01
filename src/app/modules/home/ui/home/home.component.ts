import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CONTACT_EMAIL } from '@constants/contact.constants';
import { RevealDirective } from '@shared/components/reveal/reveal.directive';
import { LogoMediaComponent } from '../logo-media/logo-media.component';
import { HOME_MEDIA } from './home-media';

interface Service {
  title: string;
  description: string;
  tag: string;
}

interface MobileLink {
  label: string;
  href?: string;
  route?: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, LogoMediaComponent, RevealDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly media = HOME_MEDIA;
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly menuOpen = signal(false);
  protected readonly slides = HOME_MEDIA.workSlides;
  protected readonly slideIndex = signal(0);

  private readonly track = viewChild<ElementRef<HTMLElement>>('carouselTrack');

  /** Desplaza el carrusel a la pieza indicada (con wrap-around). */
  protected goToSlide(index: number): void {
    const track = this.track()?.nativeElement;
    if (!track) {
      return;
    }
    const count = this.slides.length;
    const next = ((index % count) + count) % count;
    this.slideIndex.set(next);
    track.scrollTo({ left: next * this.slideUnit(track), behavior: this.smooth() });
  }

  protected stepSlide(direction: 1 | -1): void {
    this.goToSlide(this.slideIndex() + direction);
  }

  protected onTrackScroll(event: Event): void {
    const track = event.target as HTMLElement | null;
    if (!track) {
      return;
    }
    const unit = this.slideUnit(track);
    if (unit === 0) {
      return;
    }
    const count = this.slides.length;
    this.slideIndex.set(Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / unit))));
  }

  private slideUnit(track: HTMLElement): number {
    const slide = track.querySelector('.carousel-slide');
    if (!(slide instanceof HTMLElement) || slide.offsetWidth === 0) {
      return track.clientWidth || 0;
    }
    return slide.offsetWidth + 24;
  }

  private smooth(): ScrollBehavior {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
  }

  protected readonly mobileLinks: readonly MobileLink[] = [
    { label: 'AGENCIA', route: '/agency' },
    { label: 'CONTACTO', href: '#contacto' },
  ];

  protected readonly services: readonly Service[] = [
    {
      title: 'Producción de video',
      description: 'Ideamos, grabamos y editamos piezas para cualquier formato y plataforma.',
      tag: 'PRODUCCIÓN',
    },
    {
      title: 'Estrategia de contenido',
      description:
        'Planificamos calendarios y formatos que mantienen tu marca presente todo el año.',
      tag: 'CONTENIDO',
    },
    {
      title: 'Campañas de marca',
      description:
        'Conceptos visuales y activaciones que hacen que tu mensaje no pase desapercibido.',
      tag: 'MARCA',
    },
  ];
}
