import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';

const TARGET_SELECTOR = 'button, a.p-button, [role="button"], [role="tab"]';
const HINT_SELECTOR = '[data-hint]';
const SHOW_DELAY_MS = 520;
const HIDE_DELAY_MS = 90;
const GAP_PX = 8;
const EDGE_PX = 8;
/** aria-labels genéricos de PrimeNG que no explican ninguna acción. */
const GENERIC_LABELS = new Set(['dropdown trigger', 'navigation']);

/**
 * Tooltips explicativos globales: al pasar el cursor (o enfocar con teclado)
 * sobre un botón se muestra un pop-up con la acción que ejecuta.
 *
 * El texto se resuelve, en orden, desde:
 *  1. `data-hint` del propio botón o de un ancestro,
 *  2. `aria-label`,
 *  3. `title` (se consume para no mostrar el nativo duplicado),
 *  4. el texto visible del botón.
 *
 * Los elementos que ya usan `pTooltip` de PrimeNG se dejan intactos: si al
 * momento de mostrar aparece un tooltip de PrimeNG visible, este se omite.
 * En pantallas táctiles no se inicializa.
 */
@Injectable({ providedIn: 'root' })
export class ButtonHintService {
  private readonly doc = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private tip: HTMLElement | null = null;
  private current: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor() {
    if (!this.browser) return;
    const win = this.doc.defaultView;
    if (!win) return;
    if (!win.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    this.zone.runOutsideAngular(() => this.init(win));
  }

  private init(win: Window): void {
    if (this.started) return;
    this.started = true;

    this.doc.addEventListener('pointerover', this.onPointerOver, true);
    this.doc.addEventListener('pointerout', this.onPointerOut, true);
    this.doc.addEventListener('pointerdown', this.hideNow, true);
    this.doc.addEventListener('focusin', this.onFocusIn, true);
    this.doc.addEventListener('focusout', this.onFocusOut, true);
    this.doc.addEventListener('keydown', this.onKeydown, true);
    win.addEventListener('scroll', this.hideNow, true);
    win.addEventListener('resize', this.hideNow, true);
  }

  private readonly onPointerOver = (event: PointerEvent): void => {
    const host = this.findHost(event.target);
    if (!host || host === this.current) return;
    this.cancelHide();
    this.scheduleShow(host);
  };

  private readonly onPointerOut = (event: PointerEvent): void => {
    const host = this.current;
    if (!host) return;
    const related = event.relatedTarget;
    if (related instanceof Node && host.contains(related)) return;
    this.cancelShow();
    this.scheduleHide();
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    const host = this.findHost(event.target);
    if (!host || host === this.current) return;
    this.cancelHide();
    this.scheduleShow(host);
  };

  private readonly onFocusOut = (): void => {
    this.cancelShow();
    this.scheduleHide();
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hideNow();
  };

  private readonly hideNow = (): void => {
    this.cancelShow();
    this.cancelHide();
    this.hide();
  };

  private findHost(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    if (target.closest('.app-btn-hint')) return null;
    if (target.closest('.p-select-dropdown')) return null;
    const host = target.closest<HTMLElement>(TARGET_SELECTOR);
    if (!host) return null;
    if (host.closest('[data-no-hint]')) return null;
    return host;
  }

  private resolveText(host: HTMLElement): string {
    const explicit = host.closest<HTMLElement>(HINT_SELECTOR)?.getAttribute('data-hint');
    if (explicit && explicit.trim()) return this.clean(explicit);

    const aria = host.getAttribute('aria-label');
    if (aria && aria.trim() && !GENERIC_LABELS.has(aria.trim().toLowerCase())) {
      return this.clean(aria);
    }

    const title = host.getAttribute('title');
    if (title && title.trim()) {
      host.removeAttribute('title');
      return this.clean(title);
    }

    const text = host.textContent ?? host.getAttribute('value') ?? '';
    return this.clean(text);
  }

  private clean(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private scheduleShow(host: HTMLElement): void {
    this.current = host;
    this.cancelShow();
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.show(host);
    }, SHOW_DELAY_MS);
  }

  private scheduleHide(): void {
    this.cancelHide();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, HIDE_DELAY_MS);
  }

  private cancelShow(): void {
    if (!this.showTimer) return;
    clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  private cancelHide(): void {
    if (!this.hideTimer) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private show(host: HTMLElement): void {
    if (host !== this.current || !host.isConnected) return;
    if (this.primeTooltipVisible(host)) return;

    const text = this.resolveText(host);
    if (!text) return;

    const tip = this.ensureTip();
    tip.textContent = text;
    tip.classList.remove('is-visible');
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    tip.style.left = '0px';
    tip.style.top = '0px';

    const hostRect = host.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    let top = hostRect.top - tipRect.height - GAP_PX;
    if (top < EDGE_PX) top = hostRect.bottom + GAP_PX;
    const maxLeft = this.doc.defaultView!.innerWidth - tipRect.width - EDGE_PX;
    const centered = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
    const left = Math.min(Math.max(centered, EDGE_PX), Math.max(maxLeft, EDGE_PX));

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.visibility = 'visible';
    requestAnimationFrame(() => tip.classList.add('is-visible'));

    // PrimeNG puede mostrar el suyo un instante después (showDelay propio):
    // si aparece, retiramos el nuestro para no duplicar.
    setTimeout(() => {
      if (this.current === host && this.primeTooltipVisible(host)) this.hide();
    }, 260);
  }

  private primeTooltipVisible(host: HTMLElement): boolean {
    if (host.hasAttribute('pTooltip')) return true;
    const win = this.doc.defaultView;
    if (!win) return false;
    for (const node of Array.from(this.doc.querySelectorAll<HTMLElement>('.p-tooltip'))) {
      const style = win.getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  private ensureTip(): HTMLElement {
    if (this.tip) return this.tip;
    const tip = this.doc.createElement('div');
    tip.className = 'app-btn-hint';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    this.doc.body.appendChild(tip);
    this.tip = tip;
    return tip;
  }

  private hide(): void {
    this.current = null;
    if (!this.tip) return;
    this.tip.classList.remove('is-visible');
    this.tip.style.display = 'none';
  }
}
