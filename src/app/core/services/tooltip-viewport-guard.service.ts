import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

/**
 * Corrige los tooltips de PrimeNG que quedan recortados por el borde de la
 * ventana (botones cerca de los extremos). Observa cada `.p-tooltip` cuando
 * se crea y lo empuja dentro del viewport al mostrarse. Es global.
 */
@Injectable({ providedIn: 'root' })
export class TooltipViewportGuardService {
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly watched = new WeakSet<HTMLElement>();
  private scheduled = false;

  constructor() {
    if (!this.browser) return;
    const body = this.doc.body;
    if (!body) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains('p-tooltip')) this.watch(node);
          for (const tip of Array.from(node.querySelectorAll<HTMLElement>('.p-tooltip'))) {
            this.watch(tip);
          }
        }
      }
    });
    observer.observe(body, { childList: true, subtree: true });
  }

  private watch(tip: HTMLElement): void {
    if (this.watched.has(tip)) return;
    this.watched.add(tip);
    const observer = new MutationObserver(() => this.schedule());
    observer.observe(tip, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.clamp();
      setTimeout(() => this.clamp(), 30);
    });
  }

  private clamp(): void {
    if (typeof window === 'undefined') return;
    const margin = 8;
    for (const tip of Array.from(this.doc.querySelectorAll<HTMLElement>('.p-tooltip'))) {
      if (tip.style.visibility === 'hidden' || tip.style.display === 'none') continue;
      const rect = tip.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      let dx = 0;
      let dy = 0;
      if (rect.left < margin) {
        dx = margin - rect.left;
      } else if (rect.right > window.innerWidth - margin) {
        dx = window.innerWidth - margin - rect.right;
      }
      if (rect.top < margin) {
        dy = margin - rect.top;
      } else if (rect.bottom > window.innerHeight - margin) {
        dy = window.innerHeight - margin - rect.bottom;
      }
      if (!dx && !dy) continue;
      const left = Number.parseFloat(tip.style.left || '0') + dx;
      const top = Number.parseFloat(tip.style.top || '0') + dy;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }
  }
}
