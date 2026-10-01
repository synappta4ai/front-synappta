import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { HOME_MEDIA } from '../home/home-media';

/**
 * Medio (imagen o video con poster) recortado por la forma del logo de
 * Synappta mediante máscara alfa, o enmarcado clásico. Con parallax
 * opcional y mínimo (solo desktop, sin reduced-motion).
 *
 * Para el video final: poner el .mp4 en public/videos/ y sumar
 * <source src="..." type="video/mp4" /> donde indica el template.
 */
@Component({
  selector: 'app-logo-media',
  templateUrl: './logo-media.component.html',
  styleUrl: './logo-media.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onScroll()',
  },
})
export class LogoMediaComponent {
  /** Imagen visible (o poster del video). */
  readonly src = input.required<string>();
  readonly alt = input('');
  /** Si se provee, se renderiza <video> con poster en vez de <img>. */
  readonly videoSrc = input<string | null>(null);
  /** Recorta el medio con la forma del logo (máscara alfa del PNG). */
  readonly masked = input(false);
  /** Parallax sutil del medio interno al hacer scroll. */
  readonly parallax = input(false);
  readonly eager = input(false);
  /** Proporción del marco cuando NO es máscara (la máscara usa la del logo). */
  readonly ratio = input('16 / 9');

  protected readonly logoTitle = HOME_MEDIA.logoTitle;

  private readonly media = viewChild<ElementRef<HTMLElement>>('media');
  private ticking = false;

  protected frameRatio(): string {
    return this.masked() ? '594 / 141' : this.ratio();
  }

  protected onScroll(): void {
    if (!this.parallax() || this.ticking) {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (window.matchMedia('(max-width: 1023px)').matches) {
      return;
    }
    this.ticking = true;
    window.requestAnimationFrame(() => {
      this.ticking = false;
      const el = this.media()?.nativeElement;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const shift = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
      el.style.transform = `translateY(${(shift * -28).toFixed(1)}px)`;
    });
  }
}
