import { HttpRequest, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';
import { FileAsset, IngredientFile } from '@modules/library/interfaces';

import { AssetEditDialogComponent } from './asset-edit-dialog';

const base = environment.API_URL;

/** El recurso que se está editando (todavía sin elemento guardado). */
const asset: FileAsset = {
  id: 'f-1',
  filename: 'raton.png',
  url: '/uploads/images/raton.png',
  thumbnail_url: '/uploads/thumbnails/images/raton.png',
  mime_type: 'image/png',
  size: 1024,
  sha256: 'hash-1',
  category: 'images',
  format: 'png',
  storage: 'local',
  trashed: false,
  created_at: '2026-10-19T12:00:00Z',
  updated_at: '2026-10-19T12:00:00Z',
};

/** La imagen que se sube después. */
const uploaded: FileAsset = {
  ...asset,
  id: 'f-2',
  filename: 'raton-2.png',
  url: '/uploads/images/raton-2.png',
  thumbnail_url: '/uploads/thumbnails/images/raton-2.png',
  sha256: 'hash-2',
};

const asIngredientFile = (file: FileAsset): IngredientFile => ({
  file_id: file.id,
  role: null,
  filename: file.filename,
  url: file.url,
  thumbnail_url: file.thumbnail_url,
  mime_type: file.mime_type,
  category: file.category,
  format: file.format,
  size: file.size,
  created_at: file.created_at,
});

const ok = <T>(data: T) => ({ success: true, message: 'success', data });

describe('AssetEditDialogComponent', () => {
  let fixture: ComponentFixture<AssetEditDialogComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    fixture = TestBed.createComponent(AssetEditDialogComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** El diálogo pide el catálogo de proyectos al montarse. */
  function flushEvents(): void {
    for (const req of http.match((request) => request.url.startsWith(`${base}/events`))) {
      req.flush(ok([]));
    }
  }

  /** Deja correr las promesas encadenadas del componente (await en serie). */
  async function settle(): Promise<void> {
    for (let tick = 0; tick < 6; tick++) {
      fixture.detectChanges();
      await Promise.resolve();
    }
  }

  /**
   * Espera el request que cumple el predicado. El componente encadena varios
   * `await`, así que el request puede no estar todavía en vuelo.
   */
  async function next(predicate: (req: HttpRequest<unknown>) => boolean): Promise<TestRequest> {
    for (let attempt = 0; attempt < 10; attempt++) {
      fixture.detectChanges();
      const [req] = http.match(predicate);
      if (req) {
        return req;
      }
      await Promise.resolve();
    }
    return http.expectOne(predicate);
  }

  /** Abre el diálogo con el recurso indicado y espera su render. */
  async function open(item: FileAsset): Promise<void> {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('asset', item);
    fixture.detectChanges();
    flushEvents();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function dom(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function stage(): Element | null {
    return dom().querySelector('.edit-stage');
  }

  function thumbs(): NodeListOf<HTMLButtonElement> {
    return dom().querySelectorAll<HTMLButtonElement>('.edit-thumb:not(.edit-thumb--add)');
  }

  it('vincula el recurso original antes de la imagen nueva', async () => {
    await open(asset);

    const input = dom().querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const picked = new File(['x'], 'raton-2.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [picked], configurable: true });
    input!.dispatchEvent(new Event('change'));

    // 1) sube la imagen elegida
    (await next((req) => req.url === `${base}/files/upload` && req.method === 'POST')).flush(
      ok(uploaded),
    );
    await settle();

    // 2) crea el elemento sobre la marcha (aún no se había guardado)
    (await next((req) => req.url === `${base}/ingredients` && req.method === 'POST')).flush(
      ok({ id: 'ing-1', type: 'character', name: 'raton' }),
    );
    await settle();

    // 3) relee el elemento (vacío) antes de vincular
    const files = await next(
      (req) => req.url === `${base}/ingredients/ing-1/files` && req.method === 'GET',
    );
    files.flush(ok([]));
    await settle();

    // 4) vincula PRIMERO el recurso original y después la imagen nueva
    const firstLink = await next(
      (req) => req.url === `${base}/ingredients/ing-1/files` && req.method === 'POST',
    );
    expect(firstLink.request.body).toEqual({ file_id: asset.id });
    firstLink.flush(ok(asIngredientFile(asset)));
    await settle();

    const secondLink = await next(
      (req) => req.url === `${base}/ingredients/ing-1/files` && req.method === 'POST',
    );
    expect(secondLink.request.body).toEqual({ file_id: uploaded.id });
    secondLink.flush(ok(asIngredientFile(uploaded)));
    await settle();

    // 5) recarga la grilla con las dos imágenes
    const reload = await next(
      (req) => req.url === `${base}/ingredients/ing-1/files` && req.method === 'GET',
    );
    reload.flush(ok([asIngredientFile(asset), asIngredientFile(uploaded)]));
    await settle();

    expect(stage()?.querySelectorAll('img').length).toBe(1);
    expect(stage()?.querySelector('img')?.getAttribute('src')).toContain('raton-2.png');
    expect(thumbs().length).toBe(2);
  });

  it('muestra solo la imagen activa y el reel cambia cuál se ve', async () => {
    await open({ ...asset, ingredients: [{ id: 'ing-1', type: 'character', name: 'raton' }] });

    (
      await next((req) => req.url === `${base}/ingredients/ing-1` && req.method === 'GET')
    ).flush(
      ok({
        ingredient: { id: 'ing-1', type: 'character', name: 'raton', metadata: '' },
        files: [asIngredientFile(asset), asIngredientFile(uploaded)],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const images = () => stage()?.querySelectorAll('img') ?? [];
    expect(images().length).toBe(1);
    expect(images()[0].getAttribute('src')).toContain('raton.png');

    expect(thumbs().length).toBe(2);
    thumbs()[1].click();
    fixture.detectChanges();

    expect(images().length).toBe(1);
    expect(images()[0].getAttribute('src')).toContain('raton-2.png');
  });
});
