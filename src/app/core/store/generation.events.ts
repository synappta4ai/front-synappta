import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { catchError, EMPTY } from 'rxjs';

import { AgencyService } from '@modules/agency/services';

import type { StudioTake } from '@modules/studio/interfaces';

/** How often running tasks are re-polled (shared, global). */
const POLL_INTERVAL_MS = 2500;

/**
 * Global registry of generation events (video/image takes).
 *
 * Single source of truth shared by the Studio workspace, the /events page
 * and the navbar notification popover. The store owns the polling: any
 * page can start tracking a task and every consumer sees the progress.
 */
@Injectable({ providedIn: 'root' })
export class GenerationEventsStore {
  private readonly agencyService = inject(AgencyService);

  private readonly _events = signal<StudioTake[]>([]);
  private readonly polling = new Set<string>();
  private timerSub: Subscription | null = null;

  /** All events, newest first. */
  readonly events = this._events.asReadonly();

  /** Events currently queued or running. */
  readonly active = computed(() =>
    this._events().filter((e) => e.status === 'queued' || e.status === 'running'),
  );

  /** Number of active events (for the navbar badge). */
  readonly activeCount = computed(() => this.active().length);

  /** Events that finished with a video ready. */
  readonly readyCount = computed(
    () => this._events().filter((e) => e.status === 'succeeded').length,
  );

  /** Inserts or replaces an event (matched by id) keeping newest-first order. */
  upsert(take: StudioTake): void {
    this._events.update((list) => {
      const idx = list.findIndex((e) => e.id === take.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], ...take };
        return next;
      }
      return [take, ...list];
    });
  }

  /** Patches one event by id. */
  patch(id: string, patch: Partial<StudioTake>): void {
    this._events.update((list) =>
      list.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }

  /** Removes an event from the list (e.g. discarded by the user). */
  remove(id: string): void {
    this.polling.delete(id);
    this._events.update((list) => list.filter((e) => e.id !== id));
  }

  /** Starts tracking a task: the shared timer polls its status until terminal. */
  track(taskId: string): void {
    if (!taskId || taskId.startsWith('pending_')) {
      return;
    }
    this.polling.add(taskId);
    this.ensureTimer();
  }

  /** Asks the backend to cancel a task; the poll loop reflects the result. */
  cancel(id: string): void {
    this.agencyService
      .cancelTask('video', id)
      .pipe(catchError(() => EMPTY))
      .subscribe(() => this.patch(id, { status: 'cancelled' }));
  }

  private ensureTimer(): void {
    if (this.timerSub) {
      return;
    }
    this.timerSub = timer(0, POLL_INTERVAL_MS).subscribe(() => this.tick());
  }

  private tick(): void {
    if (this.polling.size === 0) {
      this.timerSub?.unsubscribe();
      this.timerSub = null;
      return;
    }
    for (const id of [...this.polling]) {
      this.agencyService
        .getStatus('video', id)
        .pipe(
          catchError(() => {
            this.patch(id, { status: 'failed', error: 'sin respuesta del servidor' });
            this.polling.delete(id);
            return EMPTY;
          }),
        )
        .subscribe((status) => {
          const out = status.outputs?.[0];
          const backend = status.status;
          const terminal = ['succeeded', 'completed', 'failed', 'cancelled'].includes(backend);
          this.patch(id, {
            status: this.mapStatus(backend),
            progress: status.progress_percent ?? 0,
            videoUrl: out?.localUrl ?? out?.url ?? null,
            error: status.error ?? null,
          });
          if (terminal) {
            this.polling.delete(id);
          }
        });
    }
  }

  private mapStatus(backend: string | undefined): StudioTake['status'] {
    switch (backend) {
      case 'succeeded':
      case 'completed':
        return 'succeeded';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      case 'pending':
        return 'queued';
      default:
        return 'running';
    }
  }
}
