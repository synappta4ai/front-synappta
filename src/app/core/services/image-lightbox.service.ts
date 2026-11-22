import { Injectable, signal } from '@angular/core';

export interface ImageLightboxState {
  src: string;
  alt: string;
}

/**
 * Estado del visor global de miniaturas. El modal que lo consume vive en el
 * layout privado y captura los clicks sobre imágenes de contenido.
 */
@Injectable({ providedIn: 'root' })
export class ImageLightboxService {
  private readonly _image = signal<ImageLightboxState | null>(null);

  readonly image = this._image.asReadonly();

  open(src: string, alt = ''): void {
    if (!src) {
      return;
    }
    this._image.set({ src, alt });
  }

  close(): void {
    this._image.set(null);
  }
}
