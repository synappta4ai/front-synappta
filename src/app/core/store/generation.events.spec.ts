import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { AgencyService } from '@modules/agency/services';
import { GenerationEventsStore } from './generation.events';
import { environment } from '@env/environment';
import type { GenerationLog } from '@modules/agency/interfaces';

describe('GenerationEventsStore hydration', () => {
  let store: GenerationEventsStore;
  let agency: AgencyService;
  let httpMock: HttpTestingController;

  const base = environment.API_URL;

  const log = (over: Partial<GenerationLog>): GenerationLog => ({
    id: 'log-1',
    task_id: 'syn_123',
    model_name: 'Wan2.1-T2V-1.3B',
    user_id: 1,
    event_id: '',
    program_id: '',
    piece_id: '',
    piece_code: '',
    generation_number: 1,
    request: JSON.stringify({ model: 'Wan2.1-T2V-1.3B', content: [{ type: 'text', text: 'gatos corriendo' }] }),
    outputs: [{ url: 'https://cdn/video.mp4', type: 'video' }],
    status: 'running',
    error_message: '',
    resource_type: 'video',
    estimated_cost: 0,
    cost_source: '',
    usage_tokens: 0,
    usage_completion_tokens: 0,
    video_duration: 5,
    video_resolution: '720p',
    video_ratio: '16:9',
    video_seed: 0,
    video_fps: 0,
    progress: 42,
    created_at: new Date().toISOString(),
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    store = TestBed.inject(GenerationEventsStore);
    agency = TestBed.inject(AgencyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('hydrates running tasks into the reel and tracks them for polling', () => {
    store.hydrate();

    const req = httpMock.expectOne(`${base}/agency/tasks/recent?limit=20`);
    req.flush({ success: true, message: 'ok', data: [log({})] });

    const events = store.events();
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      id: 'syn_123',
      prompt: 'gatos corriendo',
      modelName: 'Wan2.1-T2V-1.3B',
      status: 'running',
      progress: 42,
      videoUrl: 'https://cdn/video.mp4',
      duration: 5,
      resolution: '720p',
      ratio: '16:9',
    });
  });

  it('hydrates finished tasks as succeeded without re-polling into the queue', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({ success: true, message: 'ok', data: [log({ status: 'succeeded', progress: 100 })] });

    expect(store.events().every((e) => e.status === 'succeeded')).toBe(true);
    expect(store.active().length).toBe(0);
  });

  it('skips logs without task id and does not duplicate known ids', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({
        success: true,
        message: 'ok',
        data: [
          log({ task_id: '' }),
          log({ task_id: 'syn_123' }),
        ],
      });
    expect(store.events().length).toBe(1);

    store.hydrate();
    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({ success: true, message: 'ok', data: [log({ task_id: 'syn_123' })] });
    expect(store.events().length).toBe(1);
  });

  it('maps unknown backend statuses to running', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({ success: true, message: 'ok', data: [log({ status: 'weird_state' })] });

    expect(store.events()[0].status).toBe('running');
  });

  it('flags recent finished takes as unread on hydration and clears on markAllRead', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({
        success: true,
        message: 'ok',
        data: [log({ status: 'succeeded', progress: 100 })],
      });

    expect(store.unreadCount()).toBe(1);
    expect(store.isUnread('syn_123')).toBe(true);

    store.markAllRead();
    expect(store.unreadCount()).toBe(0);
    expect(store.isUnread('syn_123')).toBe(false);
  });

  it('does not flag old finished takes as unread', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({
        success: true,
        message: 'ok',
        data: [log({
          status: 'failed',
          error_message: 'boom',
          created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        })],
      });

    expect(store.unreadCount()).toBe(0);
  });

  it('notifies when a tracked task finishes via polling', async () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({ success: true, message: 'ok', data: [log({})] }); // running → tracked
    expect(store.unreadCount()).toBe(0);

    // timer(0) fires the first poll tick on the next macrotask.
    await new Promise((r) => setTimeout(r, 0));
    httpMock
      .expectOne(`${base}/agency/video/status/syn_123`)
      .flush({
        success: true,
        message: 'ok',
        data: { status: 'succeeded', progress_percent: 100, outputs: [{ url: 'https://x/v.mp4' }] },
      });

    expect(store.events()[0].status).toBe('succeeded');
    expect(store.unreadCount()).toBe(1);
  });

  it('applyCatalog refines display name and model type', () => {
    store.hydrate();

    httpMock
      .expectOne(`${base}/agency/tasks/recent?limit=20`)
      .flush({ success: true, message: 'ok', data: [log({})] });

    store.applyCatalog([{ name: 'Wan2.1-T2V-1.3B', displayName: 'Wan 2.1 T2V 1.3B (video ligero)', type: 'downloaded' }]);

    expect(store.events()[0].modelDisplayName).toBe('Wan 2.1 T2V 1.3B (video ligero)');
    expect(store.events()[0].modelType).toBe('downloaded');
  });
});
