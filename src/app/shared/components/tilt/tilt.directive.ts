import { Directive, ElementRef, OnDestroy, Renderer2, inject, input } from '@angular/core';
import { animate, type AnimationPlaybackControls } from 'motion';

/**
 * Tilt 3D sutil hacia el puntero con brillo (adaptación nativa del
 * TiltCard de Spectrum; sin dependencias). Solo puntero fino, sin
 * prefers-reduced-motion. En SSR no hace nada (sin eventos).
 */
@Directive({
  selector: '[appTilt]',
  host: {
    class: 'tilt',
    '(pointerenter)': 'onEnter()',
    '(pointermove)': 'onMove($event)',
    '(pointerleave)': 'onLeave()',
  },
})
export class TiltDirective implements OnDestroy {
  /** Grados máximos de inclinación (0–12). `appTilt` solo = 6. */
  readonly appTilt = input<number, unknown>(6, {
    transform: (value: unknown): number => {
      if (value === '' || value === null || value === undefined) {
        return 6;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.min(12, Math.max(0, parsed)) : 6;
    },
  });

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private active = false;
  private controls: AnimationPlaybackControls | null = null;

  protected onEnter(): void {
    if (!this.interactive()) {
      return;
    }
    this.active = true;
    const el = this.host.nativeElement;
    this.renderer.setStyle(
      el,
      'transition',
      'transform 0.15s ease-out, border-color 0.15s ease, background-color 0.15s ease',
    );
    this.renderer.addClass(el, 'tilt-on');
  }

  protected onMove(event: PointerEvent): void {
    if (!this.active && !this.interactive()) {
      return;
    }
    this.active = true;
    const el = this.host.nativeElement;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const max = this.appTilt();
    this.tiltTo(
      `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) scale(1.015)`,
      { type: 'spring', stiffness: 380, damping: 28 },
    );
    this.renderer.setStyle(el, '--tilt-x', `${((px + 0.5) * 100).toFixed(1)}%`);
    this.renderer.setStyle(el, '--tilt-y', `${((py + 0.5) * 100).toFixed(1)}%`);
    this.renderer.addClass(el, 'tilt-on');
  }

  protected onLeave(): void {
    this.active = false;
    const el = this.host.nativeElement;
    this.tiltTo('perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)', {
      type: 'spring',
      stiffness: 220,
      damping: 24,
    });
    this.renderer.removeStyle(el, '--tilt-x');
    this.renderer.removeStyle(el, '--tilt-y');
    this.renderer.removeClass(el, 'tilt-on');
  }

  private tiltTo(
    transform: string,
    spring: { type: 'spring'; stiffness: number; damping: number },
  ): void {
    this.controls?.stop();
    this.controls = animate(this.host.nativeElement, { transform }, spring);
  }

  ngOnDestroy(): void {
    this.controls?.stop();
    this.controls = null;
  }

  private interactive(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return !window.matchMedia('(pointer: coarse)').matches;
  }
}
