import { Directive, ElementRef, OnDestroy, OnInit, Renderer2, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

/**
 * Reveal on viewport entry (una vez). Sin JS/SSR el contenido queda
 * visible: la clase oculta solo se agrega en navegador.
 */
@Directive({
  selector: '[appReveal]',
})
export class RevealDirective implements OnInit, OnDestroy {
  readonly delay = input(0, { alias: 'appRevealDelay' });

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    const el = this.host.nativeElement;
    if (!this.browser || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const delay = this.delay();
    if (delay > 0) {
      this.renderer.setStyle(el, 'transitionDelay', `${delay}ms`);
    }
    this.renderer.addClass(el, 'reveal');
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.renderer.addClass(el, 'is-visible');
            this.observer?.disconnect();
            this.observer = null;
          }
        }
      },
      { threshold: 0.15 },
    );
    this.observer.observe(el);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
