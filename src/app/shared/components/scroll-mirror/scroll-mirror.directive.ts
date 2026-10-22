import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Espeja el scroll de un elemento sobre otro (host → destino).
 *
 * El prompt del Studio es un textarea transparente con un overlay detrás que
 * repite el texto (y resalta los @). Cuando el texto supera el alto máximo el
 * textarea scrollea por dentro y el overlay se queda en el tope: se ve un texto
 * distinto del que se edita, y reescribirlo se vuelve imposible. Esta directiva
 * copia scrollTop/scrollLeft en cada scroll y también después de cada
 * reescritura del destino (el [innerHTML] del overlay resetea su scroll).
 */
@Directive({
  selector: '[appScrollMirror]',
  host: {
    '(scroll)': 'sync()',
  },
})
export class ScrollMirrorDirective implements AfterViewInit, OnDestroy {
  /** Elemento que refleja el scroll del host (referencia de template). */
  readonly appScrollMirror = input<ElementRef<HTMLElement> | HTMLElement | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: MutationObserver | null = null;

  ngAfterViewInit(): void {
    const target = this.target();
    if (!target) {
      return;
    }
    // El overlay se reescribe con [innerHTML] en cada tecla y eso resetea su
    // scroll: se re-alinea cuando cambian sus hijos.
    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(() => this.sync());
      this.observer.observe(target, { childList: true, subtree: true });
    }
    this.sync();
  }

  protected sync(): void {
    const target = this.target();
    if (!target) {
      return;
    }
    const source = this.host.nativeElement;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private target(): HTMLElement | null {
    const ref = this.appScrollMirror();
    if (!ref) {
      return null;
    }
    return ref instanceof ElementRef ? ref.nativeElement : ref;
  }
}
