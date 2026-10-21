import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '@env/environment';

import { AiModel } from '../interfaces';
import { ModelCatalogService } from './model-catalog.service';

const base = environment.API_URL;

function model(name: string, modality: AiModel['modality']): AiModel {
  return {
    name,
    display_name: name,
    modality,
    generator: 'x',
    credential_provider: 'gemini',
    base_url: 'https://example.test',
    endpoint: '/x',
    gallery_sync: false,
    defaults: {},
  };
}

describe('ModelCatalogService', () => {
  let service: ModelCatalogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ModelCatalogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('pide el catálogo una sola vez por modalidad', () => {
    const received: string[][] = [];
    service.byModality('image').subscribe((models) => received.push(models.map((m) => m.name)));
    service.byModality('image').subscribe((models) => received.push(models.map((m) => m.name)));

    const req = httpMock.expectOne(`${base}/models/image`);
    req.flush({ success: true, message: 'success', data: [model('soul', 'image')] });

    // Dos suscriptores, una petición: el segundo recibe lo memorizado.
    expect(received).toEqual([['soul'], ['soul']]);
    httpMock.expectNone(`${base}/models/image`);
  });

  it('no memoriza un error: la próxima suscripción reintenta', () => {
    const failures: number[] = [];
    service.byModality('video').subscribe({ error: () => failures.push(1) });

    httpMock
      .expectOne(`${base}/models/video`)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(failures.length).toBe(1);

    let names: string[] = [];
    service.byModality('video').subscribe((models) => (names = models.map((m) => m.name)));
    httpMock
      .expectOne(`${base}/models/video`)
      .flush({ success: true, message: 'success', data: [model('kling', 'video')] });

    expect(names).toEqual(['kling']);
  });

  it('junta varias modalidades en el orden pedido', () => {
    let names: string[] = [];
    service
      .byModalities(['text', 'image'])
      .subscribe((models) => (names = models.map((m) => m.name)));

    httpMock
      .expectOne(`${base}/models/text`)
      .flush({ success: true, message: 'success', data: [model('claude-text', 'text')] });
    httpMock
      .expectOne(`${base}/models/image`)
      .flush({ success: true, message: 'success', data: [model('soul', 'image')] });

    expect(names).toEqual(['claude-text', 'soul']);
  });

  it('refresh() obliga a volver a pedir la modalidad', () => {
    service.byModality('image').subscribe();
    httpMock
      .expectOne(`${base}/models/image`)
      .flush({ success: true, message: 'success', data: [] });

    service.refresh('image');
    service.byModality('image').subscribe();
    httpMock
      .expectOne(`${base}/models/image`)
      .flush({ success: true, message: 'success', data: [] });
  });
});
