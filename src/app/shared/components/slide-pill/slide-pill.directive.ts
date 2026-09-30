import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  inject,
  input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Píldora deslizante para grupos de segmentos (modo Video/Imagen, chips de
 * filtro, links del menubar). UI-only: no cambia estado ni emite eventos.
 *
 * Crea un `<div class="seg-pill {pillClass}">` dentro del contenedor y lo
 * posiciona sobre el item que lleve la clase activa. Sin medidas (SSR/jsdom)
 * no hace nada visible: los estilos estáticos actuales siguen valiendo.
 */
@Directive({
  selector: '[appSlidePill]',
})
export class SlidePillDirective implements OnInit, OnDestroy {
  /** Selector CSS de los items del segmento (ej. '.mode-btn'). */
  readonly appSlidePill = input<string>('');
  /** Clase que marca el item activo (se prueban además 'chip-active' y 'p-menubar-item-link-active'). */
  readonly activeClass = input<string>('active');
  /** Clases extra para la píldora (ej. 'nav-pill'). */
  readonly pillClass = input<string>('');
  /** Si se provee, la píldora vive en el primer descendiente que matchee (ej. '.p-menubar-root-list'). */
  readonly containerSelector = input<string>('');

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private pill: HTMLDivElement | null = null;
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unlistenClick: (() => void) | null = null;
  private rafIds: number[] = [];

  ngOnInit(): void {
    if (!this.browser) {
      return;
    }
    const host = this.hostRef.nativeElement;
    this.unlistenClick = this.renderer.listen(host, 'click', () => this.refresh());
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => this.scheduleFrame());
      observer.observe(host, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true,
      });
      this.mutationObserver = observer;
    }
    const container = this.resolveContainer(host);
    if (container && typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(() => this.refresh());
      resize.observe(container);
      if (container !== host) {
        resize.observe(host);
      }
      this.resizeObserver = resize;
    }
    this.refresh();
    this.scheduleDoubleFrame();
  }

  ngOnDestroy(): void {
    this.unlistenClick?.();
    this.unlistenClick = null;
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof cancelAnimationFrame === 'function') {
      for (const id of this.rafIds) {
        cancelAnimationFrame(id);
      }
    }
    this.rafIds = [];
    if (this.pill?.parentNode) {
      this.renderer.removeChild(this.pill.parentNode, this.pill);
    }
    this.pill = null;
  }

  /** Re-mide el activo y reposiciona la píldora. Público para tests y reintentos. */
  public refresh(): void {
    if (!this.browser) {
      return;
    }
    const host = this.hostRef.nativeElement;
    const container = this.resolveContainer(host);
    if (!container) {
      return;
    }
    this.ensurePill(container);
    if (!this.pill) {
      return;
    }
    const active = this.findActive(container);
    if (!active) {
      return;
    }
    const width = active.offsetWidth;
    const height = active.offsetHeight;
    if (!width || !height) {
      return;
    }
    const x = active.offsetLeft;
    const y = active.offsetTop;
    this.renderer.setStyle(this.pill, 'width', `${width}px`);
    this.renderer.setStyle(this.pill, 'height', `${height}px`);
    this.renderer.setStyle(this.pill, 'transform', `translate(${x}px, ${y}px)`);
    try {
      const radius = getComputedStyle(active).borderRadius;
      if (radius) {
        this.renderer.setStyle(this.pill, 'borderRadius', radius);
      }
    } catch {
      // jsdom o entornos exóticos: la píldora sigue posicionada sin radio copiado.
    }
    if (!container.classList.contains('seg-on')) {
      this.renderer.addClass(container, 'seg-on');
    }
  }

  private resolveContainer(host: HTMLElement): HTMLElement | null {
    const selector = this.containerSelector().trim();
    if (!selector) {
      return host;
    }
    return host.querySelector<HTMLElement>(selector);
  }

  private ensurePill(container: HTMLElement): void {
    if (this.pill) {
      if (this.pill.parentNode !== container) {
        this.renderer.appendChild(container, this.pill);
      }
      return;
    }
    const pill = this.renderer.createElement('div') as HTMLDivElement;
    this.renderer.addClass(pill, 'seg-pill');
    for (const cls of this.pillClass().split(/\s+/).filter(Boolean)) {
      this.renderer.addClass(pill, cls);
    }
    this.renderer.appendChild(container, pill);
    this.pill = pill;
  }

  private findActive(container: HTMLElement): HTMLElement | null {
    const selector = this.appSlidePill().trim();
    if (!selector) {
      return null;
    }
    const preferred = this.activeClass().trim();
    const candidates = [preferred, 'active', 'chip-active', 'p-menubar-item-link-active'].filter(
      (cls, index, all) => cls.length > 0 && all.indexOf(cls) === index,
    );
    const items = container.querySelectorAll<HTMLElement>(selector);
    for (const candidate of candidates) {
      for (const item of Array.from(items)) {
        if (item.classList.contains(candidate)) {
          return item;
        }
      }
    }
    return null;
  }

  private scheduleFrame(): void {
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(() => this.refresh());
      this.rafIds.push(id);
    } else {
      this.refresh();
    }
  }

  private scheduleDoubleFrame(): void {
    if (typeof requestAnimationFrame === 'function') {
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => this.refresh());
        this.rafIds.push(second);
      });
      this.rafIds.push(first);
    } else {
      this.refresh();
    }
  }
}
