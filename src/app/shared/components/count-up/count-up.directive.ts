import {
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  effect,
  inject,
  input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { animate, type AnimationPlaybackControls } from 'motion';

/**
 * Ticker numérico: anima el entero mostrado al cambiar el valor
 * (number ticker). En SSR o con prefers-reduced-motion escribe directo.
 */
@Directive({
  selector: '[appCountUp]',
})
export class CountUpDirective implements OnDestroy {
  readonly appCountUp = input.required<number>();
  readonly appCountUpSuffix = input('');

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private controls: AnimationPlaybackControls | null = null;
  private current = 0;
  private first = true;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      const suffix = this.appCountUpSuffix();
      if (!Number.isFinite(target)) {
        return;
      }
      if (!this.browser || this.first || this.reducedMotion()) {
        this.render(target, suffix);
      } else {
        this.controls?.stop();
        try {
          const from = this.current;
          this.controls = animate(from, target, {
            duration: 0.6,
            ease: 'easeOut',
            onUpdate: (value: number) => this.render(value, suffix),
          });
        } catch {
          // Sin rAF (jsdom/tests): escritura directa.
          this.render(target, suffix);
        }
      }
      this.current = target;
      this.first = false;
    });
  }

  ngOnDestroy(): void {
    this.controls?.stop();
    this.controls = null;
  }

  private render(value: number, suffix: string): void {
    this.host.nativeElement.textContent = `${Math.round(value)}${suffix}`;
  }

  private reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
