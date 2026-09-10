import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { AgencyApiRepository } from './agency-api.repository';

describe('AgencyApiRepository', () => {
  let repository: AgencyApiRepository;
  let httpMock: HttpTestingController;

  const base = 'http://localhost:9099/api/v1';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    repository = TestBed.inject(AgencyApiRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists models by modality', () => {
    repository.listModelsByModality('video').subscribe((response) => {
      expect(response.data?.length).toBe(1);
    });

    const req = httpMock.expectOne(`${base}/models/video`);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      message: 'success',
      data: [{ name: 'dreamina-seedance-2-0-260128' }],
    });
  });

  it('posts generation requests to the modality endpoint', () => {
    const payload = {
      model: 'dreamina-seedance-2-0-260128',
      content: [{ type: 'text' as const, text: 'A sunrise over the mountains' }],
      event_id: 'evt-1',
      piece_id: 'piece-1',
      piece_code: 'PC-01',
      generation_number: 1,
    };

    repository.generate('video', payload).subscribe((response) => {
      expect(response.data?.taskId).toBe('task-1');
    });

    const req = httpMock.expectOne(`${base}/agency/video/generate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      success: true,
      message: 'created',
      data: { taskId: 'task-1', model: payload.model, status: 'running' },
    });
  });

  it('polls task status at the status endpoint', () => {
    repository.getStatus('video', 'task-1').subscribe();

    httpMock.expectOne(`${base}/agency/video/status/task-1`).flush({
      success: true,
      message: 'success',
      data: { status: 'succeeded', outputs: [{ url: 'https://cdn/video.mp4', type: 'video' }] },
    });
  });
});
