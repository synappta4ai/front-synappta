import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

interface ScrollSnapshot {
  x: number;
  y: number;
  ancestors: { el: HTMLElement; top: number }[];
}

const OVERLAY_SELECTOR =
  '.p-select-overlay, .p-dropdown-panel, .p-multiselect-panel, .p-autocomplete-panel';

/**
 * Evita los saltos de scroll de PrimeNG al abrir/cerrar un desplegable:
 * - Al abrir, Select hace `scrollIntoView` sobre la opción seleccionada y
 *   arrastra la página complete (no solo el panel).
 * - Al elegir, vuelve a enfocar el input oculto y el navegador scrollea hasta
 *   él.
 * Guardamos la posición al interactuar y restauramos la página durante la
 * ventana de interacción. Es global para toda la app.
 */
@Injectable({ providedIn: 'root' })
export class SelectScrollGuardService {
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private snapshot: ScrollSnapshot | null = null;
  private lastSelect: HTMLElement | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private interactionUntil = 0;
  private reverting = false;

  constructor() {
    if (!this.browser) return;
    this.neutralizeOverlayScrollIntoView();
    this.doc.addEventListener('pointerdown', this.onPointerDown, true);
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    this.doc.addEventListener('focusin', this.onFocusIn, true);
    this.doc.defaultView?.addEventListener('scroll', this.onWindowScroll, { passive: true });
  }

  /**
   * PrimeNG llama `scrollIntoView()` sobre la opción seleccionada al abrir el
   * panel. Ese método arrastra TODOS los ancestros scrollables, incluida la
   * página. Lo reemplazamos dentro del panel por un scroll únicamente de la
   * lista del desplegable: la página no se mueve.
   */
  private neutralizeOverlayScrollIntoView(): void {
    if (typeof Element === 'undefined') return;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions): void {
      const element = this as Element;
      if (element.closest?.('.p-select-overlay')) {
        const container = element.closest('[data-pc-section="listcontainer"]') as HTMLElement | null;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          if (elementRect.top < containerRect.top) {
            container.scrollTop += elementRect.top - containerRect.top;
          } else if (elementRect.bottom > containerRect.bottom) {
            container.scrollTop += elementRect.bottom - containerRect.bottom;
          }
        }
        return;
      }
      original.call(this, arg as ScrollIntoViewOptions);
    };
  }

  private onPointerDown = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target) return;
    const select = target.closest('p-select, .p-select');
    if (select) {
      this.lastSelect = select as HTMLElement;
      this.capture();
      this.scheduleClear();
      return;
    }
    if (target.closest(OVERLAY_SELECTOR)) {
      this.capture();
      this.scheduleClear();
    }
  };

  private onKeyDown = (event: Event): void => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key !== 'Enter' && keyboard.key !== ' ' && keyboard.key !== 'Spacebar') {
      return;
    }
    const target = event.target as Element | null;
    const select = target?.closest('p-select, .p-select');
    if (select) this.lastSelect = select as HTMLElement;
    if (!target?.closest('.p-select-overlay, p-select, .p-select')) return;
    this.capture();
    this.scheduleClear();
  };

  private onFocusIn = (event: Event): void => {
    const target = event.target as Element | null;
    if (!this.snapshot || !target?.closest('p-select')) return;
    this.restore();
  };

  private capture(): void {
    if (typeof window === 'undefined') return;
    const ancestors: { el: HTMLElement; top: number }[] = [];
    let el = this.lastSelect?.parentElement ?? null;
    while (el && el !== this.doc.body) {
      if (el.scrollHeight > el.clientHeight) {
        ancestors.push({ el, top: el.scrollTop });
      }
      el = el.parentElement;
    }
    this.snapshot = { x: window.scrollX, y: window.scrollY, ancestors };
    this.interactionUntil = performance.now() + 900;
    // El scrollIntoView del panel corre después del click (y de su
    // animación): restauramos en varios momentos de la ventana.
    setTimeout(() => this.restore(), 0);
    setTimeout(() => this.restore(), 60);
    setTimeout(() => this.restore(), 160);
    setTimeout(() => this.restore(), 320);
  }

  private onWindowScroll = (): void => {
    if (!this.snapshot || this.reverting || typeof window === 'undefined') return;
    if (performance.now() > this.interactionUntil) return;
    if (Math.abs(window.scrollY - this.snapshot.y) <= 2) return;
    this.reverting = true;
    this.restore();
    setTimeout(() => {
      this.reverting = false;
    }, 60);
  };

  private restore(): void {
    const snapshot = this.snapshot;
    if (!snapshot || typeof window === 'undefined') return;
    const apply = (): void => {
      window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' as ScrollBehavior });
      for (const item of snapshot.ancestors) item.el.scrollTop = item.top;
    };
    apply();
    requestAnimationFrame(apply);
  }

  private scheduleClear(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.snapshot = null;
      this.lastSelect = null;
      this.clearTimer = null;
    }, 10_000);
  }
}
