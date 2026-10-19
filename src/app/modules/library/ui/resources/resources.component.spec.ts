import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';
import { FileAsset, FileIngredientRef } from '@modules/library/interfaces';

import { ResourcesComponent } from './resources.component';

const base = environment.API_URL;

/** Ingrediente (locación) que comparten las tomas de una misma escena. */
const tech: FileIngredientRef = { id: 'ing-tech', type: 'location', name: 'tech' };
const patio: FileIngredientRef = { id: 'ing-patio', type: 'location', name: 'patio' };

/** Dos tomas del mismo ingrediente + un recurso suelto, más nuevos primero. */
const files: FileAsset[] = [
  {
    id: 'f-1',
    filename: 'tech/45° frontal izquierda.jpg',
    url: '/uploads/images/tech/frontal.jpg',
    thumbnail_url: '/uploads/thumbnails/images/tech/frontal.jpg',
    mime_type: 'image/jpeg',
    size: 817_152,
    sha256: 'hash-1',
    category: 'location',
    format: 'jpeg',
    storage: 'local',
    trashed: false,
    ingredients: [tech],
    created_at: '2026-10-18T12:00:00Z',
    updated_at: '2026-10-18T12:00:00Z',
  },
  {
    id: 'f-2',
    filename: 'tech/Cenital.jpg',
    url: '/uploads/images/tech/cenital.jpg',
    thumbnail_url: '/uploads/thumbnails/images/tech/cenital.jpg',
    mime_type: 'image/jpeg',
    size: 877_568,
    sha256: 'hash-2',
    category: 'location',
    format: 'jpeg',
    storage: 'local',
    trashed: false,
    ingredients: [tech],
    created_at: '2026-10-18T11:00:00Z',
    updated_at: '2026-10-18T11:00:00Z',
  },
  {
    id: 'f-3',
    filename: 'suelto.jpg',
    url: '/uploads/images/suelto.jpg',
    thumbnail_url: null,
    mime_type: 'image/jpeg',
    size: 204_800,
    sha256: 'hash-3',
    category: 'images',
    format: 'jpeg',
    storage: 'local',
    trashed: false,
    created_at: '2026-10-17T10:00:00Z',
    updated_at: '2026-10-17T10:00:00Z',
  },
];

/** Un archivo que referencia dos ingredientes une sus grupos. */
const bridging: FileAsset[] = [
  { ...files[0], id: 'b-1', filename: 'patio/norte.jpg', ingredients: [patio] },
  {
    ...files[1],
    id: 'b-2',
    filename: 'tech/este.jpg',
    ingredients: [tech],
    created_at: '2026-10-18T10:00:00Z',
  },
  {
    ...files[0],
    id: 'b-3',
    filename: 'patio/norte-2.jpg',
    ingredients: [tech, patio],
    created_at: '2026-10-16T09:00:00Z',
  },
];

interface Internals {
  counts: () => Record<string, number>;
}

describe('ResourcesComponent — agrupación por ingrediente', () => {
  let fixture: ComponentFixture<ResourcesComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResourcesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(ResourcesComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  /** El diálogo "Editar elemento" pide el catálogo de proyectos al montarse. */
  function flushEvents(): void {
    for (const req of http.match((request) => request.url.startsWith(`${base}/events`))) {
      req.flush({ success: true, message: 'success', data: [] });
    }
  }

  /** Sirve una página de /files/page y deja la grilla renderizada. */
  async function load(items: FileAsset[]): Promise<HTMLElement> {
    fixture.detectChanges();
    http
      .expectOne((req) => req.url === `${base}/files/page`)
      .flush({
        success: true,
        message: 'success',
        data: { items, total: items.length, page: 1, page_size: 48 },
      });
    flushEvents();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('junta en una card los recursos del mismo ingrediente y cuenta sus imágenes', async () => {
    const dom = await load(files);
    const cards = dom.querySelectorAll('.resource-card');

    expect(cards.length).toBe(2);

    // La card del grupo representa el recurso más nuevo y muestra el contador.
    const grouped = cards[0];
    expect(grouped.querySelector('.resource-card__name')?.textContent?.trim()).toBe(
      'tech/45° frontal izquierda.jpg',
    );
    expect(grouped.querySelector('.overlay-badge--top')?.textContent?.trim()).toBe('2');

    // Un mini icono por imagen del grupo, cada uno apunta a su archivo.
    const thumbs = grouped.querySelectorAll('.group-strip__item');
    expect(thumbs.length).toBe(2);
    expect(thumbs[0].getAttribute('title')).toBe('tech/45° frontal izquierda.jpg');
    expect(thumbs[1].getAttribute('title')).toBe('tech/Cenital.jpg');

    // El recurso sin ingrediente queda solo: sin contador ni miniaturas.
    const single = cards[1];
    expect(single.querySelector('.resource-card__name')?.textContent?.trim()).toBe('suelto.jpg');
    expect(single.querySelector('.overlay-badge--top')).toBeNull();
    expect(single.querySelectorAll('.group-strip__item').length).toBe(0);
  });

  it('une en un solo grupo los archivos que comparten ingrediente por cualquiera de sus refs', async () => {
    const dom = await load(bridging);
    const cards = dom.querySelectorAll('.resource-card');

    expect(cards.length).toBe(1);
    expect(cards[0].querySelector('.overlay-badge--top')?.textContent?.trim()).toBe('3');
    expect(cards[0].querySelectorAll('.group-strip__item').length).toBe(3);
    // La card muestra todos los ingredientes que la componen, sin repetir.
    expect(cards[0].querySelectorAll('.ing-chip').length).toBe(2);
  });

  it('resume con "+N" cuando el grupo tiene más imágenes que mini iconos', async () => {
    // El back devuelve lo más nuevo primero.
    const many: FileAsset[] = Array.from({ length: 7 }, (_, i) => ({
      ...files[0],
      id: `m-${i}`,
      filename: `tech/plano-${i}.jpg`,
      created_at: `2026-10-18T1${i}:00:00Z`,
      updated_at: `2026-10-18T1${i}:00:00Z`,
    })).reverse();

    const dom = await load(many);

    expect(dom.querySelectorAll('.resource-card').length).toBe(1);
    expect(dom.querySelector('.overlay-badge--top')?.textContent?.trim()).toBe('7');
    expect(dom.querySelectorAll('.group-strip__item').length).toBe(5);
    expect(dom.querySelector('.group-strip__more')?.textContent?.trim()).toBe('+2');
  });

  it('cuenta cards y no archivos en las pestañas de filtro', async () => {
    await load(files);
    const internals = fixture.componentInstance as unknown as Internals;

    expect(internals.counts()['all']).toBe(2);
    expect(internals.counts()['images']).toBe(2);
    expect(internals.counts()['location']).toBe(1);
  });
});
