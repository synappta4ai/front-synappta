import { Directive, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/**
 * Fundido de entrada para imágenes (reveal de skeleton): la imagen parte
 * invisible sobre el fondo del thumb y aparece al cargar. SSR-safe: sin
 * el evento load (servidor o caché ya resuelta) se verifica `complete`.
 */
@Directive({
  selector: '[appImgFade]',
  host: {
    class: 'img-fade',
    '(load)': 'onLoad()',
    '[class.img-fade-on]': 'loaded()',
  },
})
export class ImgFadeDirective {
  protected readonly loaded = signal(false);

  private readonly host = inject(ElementRef<HTMLImageElement>);

  constructor() {
    afterNextRender(() => {
      const img = this.host.nativeElement;
      if (img.complete && img.naturalWidth > 0) {
        this.loaded.set(true);
      }
    });
  }

  protected onLoad(): void {
    this.loaded.set(true);
  }
}
