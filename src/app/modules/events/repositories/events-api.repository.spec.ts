import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { EventsApiRepository } from './events-api.repository';

describe('EventsApiRepository', () => {
  let repository: EventsApiRepository;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:9099/api/v1';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    repository = TestBed.inject(EventsApiRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists active events by default', () => {
    repository.listEvents().subscribe((response) => {
      expect(response.success).toBe(true);
    });

    const req = httpMock.expectOne(`${base}/events?all=false`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, message: 'success', data: [] });
  });

  it('creates events with the payload', () => {
    repository.createEvent({ name: 'Festival' }).subscribe();

    const req = httpMock.expectOne(`${base}/events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Festival' });
    req.flush({ success: true, message: 'created', data: { id: 'evt-1', name: 'Festival' } });
  });

  it('fetches the full event tree by id', () => {
    repository.getEvent('evt-1').subscribe();

    httpMock
      .expectOne(`${base}/events/evt-1`)
      .flush({ success: true, message: 'success', data: { event: {}, programs: [] } });
  });

  it('creates generation slots on a piece', () => {
    repository.createGeneration('piece-1', { number: 1 }).subscribe();

    const req = httpMock.expectOne(`${base}/pieces/piece-1/generations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ number: 1 });
    req.flush({ success: true, message: 'created', data: { id: 'gen-1' } });
  });
});
