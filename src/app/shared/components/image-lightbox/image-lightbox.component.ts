import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, PLATFORM_ID } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ImageLightboxService } from '@services/image-lightbox.service';

/** Elementos que ya tienen una acción propia: no abrimos el visor encima. */
const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'label',
  'summary',
  'select',
  'input',
  'textarea',
  '[role="button"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(', ');

/** Modal global que muestra ampliada la miniatura tocada en cualquier sección. */
@Component({
  selector: 'app-image-lightbox',
  imports: [TranslatePipe],
  template: `
    @if (image(); as img) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'SHARED.IMAGE_VIEWER.ARIA' | translate"
        (click)="close()"
      >
        <button
          type="button"
          class="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          [attr.aria-label]="'SHARED.IMAGE_VIEWER.CLOSE' | translate"
          (click)="close()"
        >
          <i class="md md-close"></i>
        </button>

        <img
          [src]="img.src"
          [alt]="img.alt"
          class="min-h-[50vh] min-w-[50vw] max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          (click)="$event.stopPropagation()"
        />
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'close()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageLightboxComponent {
  private readonly service = inject(ImageLightboxService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly image = this.service.image;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.document.addEventListener('click', this.onDocumentClick, true);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('click', this.onDocumentClick, true);
      this.close();
    });
  }

  protected close(): void {
    this.service.close();
  }

  private readonly onDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('app-image-lightbox')) {
      return;
    }

    const image = target.closest('img');
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    if (image.closest('[data-no-lightbox]')) {
      return;
    }
    // La miniatura ya es un control (selección, abrir detalle, etc.).
    if (image.closest(INTERACTIVE_SELECTOR)) {
      return;
    }

    const rect = image.getBoundingClientRect();
    if (rect.width < 48 || rect.height < 40) {
      return;
    }

    const src = this.sourceFor(image);
    if (!src) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.service.open(src, image.alt || image.title || '');
  };

  /** Prefiere la imagen completa sobre la miniatura del API de archivos. */
  private sourceFor(image: HTMLImageElement): string {
    const raw = image.getAttribute('data-full-src') || image.currentSrc || image.src;
    if (!raw) {
      return '';
    }
    try {
      const url = new URL(raw, this.document.baseURI);
      return url.href.replace(/\/thumbnail(?=$|\?)/, '/serve');
    } catch {
      return raw;
    }
  }
}
