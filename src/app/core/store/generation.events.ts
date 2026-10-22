import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { catchError, EMPTY } from 'rxjs';

import { AgencyService } from '@modules/agency/services';

import type { GenerateRequest, GenerationLog } from '@modules/agency/interfaces';
import type { StudioTake, StudioTakeRef } from '@modules/studio/interfaces';

/** How often running tasks are re-polled (shared, global). */
const POLL_INTERVAL_MS = 2500;

/** Backend statuses that mean a task is done (no more polling). */
const TERMINAL_BACKEND_STATUSES: readonly string[] = [
  'succeeded',
  'completed',
  'failed',
  'cancelled',
];

/** Finished takes newer than this surface as unread on hydration. */
const RECENT_FINISHED_MS = 30 * 60 * 1000;

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
  /** Ids of takes that finished (ok/failed) while tracked and not seen yet. */
  private readonly _unread = signal<string[]>([]);
  /**
   * Selected history day (local YYYY-MM-DD) when the user recovers a past
   * session from the date history; null = live reel (all recent takes).
   */
  private readonly _sessionDate = signal<string | null>(null);
  private readonly polling = new Set<string>();
  private timerSub: Subscription | null = null;

  /** All events, newest first. */
  readonly events = this._events.asReadonly();

  /** Selected history day (null = live reel). */
  readonly sessionDate = this._sessionDate.asReadonly();

  /** Events currently queued or running. */
  readonly active = computed(() =>
    this._events().filter((e) => e.status === 'queued' || e.status === 'running'),
  );

  /** Number of active events (for the navbar badge). */
  readonly activeCount = computed(() => this.active().length);

  /** Finished takes (ok/error) the user has not seen yet (navbar badge count). */
  readonly unreadCount = computed(() => this._unread().length);

  /** Reports whether a take finished and is still unread. */
  isUnread(id: string): boolean {
    return this._unread().includes(id);
  }

  /** Marks every finished take as seen (user opened the bell popover). */
  markAllRead(): void {
    this._unread.set([]);
  }

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
    this._events.update((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
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

  /**
   * Restores the take reel after a page reload: pulls the user's recent
   * generations from the backend and merges them in (newest first). Tasks
   * still running resume polling; finished ones land ready in the reel.
   */
  hydrate(limit = 20): void {
    this.agencyService
      .listRecentTasks(limit)
      .pipe(catchError(() => EMPTY))
      .subscribe((logs) => this.mergeLogs(logs ?? []));
  }

  /**
   * Loads the video generations of ONE project into the reel: used when the
   * studio opens a project (e.g. "Ir a estudio" from the agency flow) so its
   * takes are already visible without waiting for the global hydration.
   */
  hydrateProject(eventId: string, limit = 50): void {
    if (!eventId) {
      return;
    }
    this.agencyService
      .taskHistory({ event_id: eventId, resource_type: 'video', limit })
      .pipe(catchError(() => EMPTY))
      .subscribe((logs) => this.mergeLogs(logs ?? []));
  }

  /** Merges backend logs into the reel (newest first) and resumes polling. */
  private mergeLogs(logs: GenerationLog[]): void {
    for (const log of logs) {
      if (!log.task_id || log.task_id === '<no-task>' || this._events().some((e) => e.id === log.task_id)) {
        continue;
      }
      const take = this.takeFromLog(log);
      this.upsert(take);
      if (!TERMINAL_BACKEND_STATUSES.includes(log.status)) {
        this.track(log.task_id);
      } else if (take.status === 'succeeded' || take.status === 'failed') {
        // Finished while the user was away (recent only): badge it so the
        // reload does not swallow the result.
        if (Date.now() - take.createdAt < RECENT_FINISHED_MS) {
          this.notify(take.id);
        }
      }
    }
  }

  /**
   * Recovers the session of a given local day (YYYY-MM-DD): pulls the user's
   * video generations from the backend between that day's boundaries and
   * merges them into the reel (newest first). Running tasks resume polling.
   */
  loadSession(dateISO: string): void {
    this._sessionDate.set(dateISO);
    const from = new Date(`${dateISO}T00:00:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    this.agencyService
      .taskHistory({ from: from.toISOString(), to: to.toISOString(), resource_type: 'video', limit: 200 })
      .pipe(catchError(() => EMPTY))
      .subscribe((logs) => {
        for (const log of logs ?? []) {
          if (!log.task_id || log.task_id === '<no-task>') {
            continue;
          }
          this.upsert(this.takeFromLog(log));
          if (!TERMINAL_BACKEND_STATUSES.includes(log.status)) {
            this.track(log.task_id);
          }
        }
      });
  }

  /** Leaves session mode: the reel goes back to the live (all-days) view. */
  clearSession(): void {
    this._sessionDate.set(null);
  }

  /**
   * Sets the two-check rating ("Buena toma" / "Elegida final") of a take:
   * optimistic local patch, then persisted on the backend (owner-only).
   * On API failure the previous flags are restored.
   */
  setRating(id: string, good: boolean, final: boolean): void {
    const previous = this._events().find((e) => e.id === id);
    if (!previous) {
      return;
    }
    this.patch(id, { ratingGood: good, ratingFinal: final });
    this.agencyService
      .updateTaskRating(id, good, final)
      .pipe(
        catchError(() => {
          this.patch(id, {
            ratingGood: previous.ratingGood ?? false,
            ratingFinal: previous.ratingFinal ?? false,
          });
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /**
   * Refines display fields of hydrated takes once the model catalog is
   * available (hydrated rows only know the raw model name).
   */
  applyCatalog(
    models: { name: string; displayName: string; type: StudioTake['modelType'] }[],
  ): void {
    if (!models.length) {
      return;
    }
    const byName = new Map(models.map((m) => [m.name, m]));
    this._events.update((list) =>
      list.map((e) => {
        const m = byName.get(e.modelName);
        return m
          ? { ...e, modelDisplayName: m.displayName || e.modelDisplayName, modelType: m.type }
          : e;
      }),
    );
  }

  /** Maps a backend GenerationLog to a reel/queue entry. */
  private takeFromLog(log: GenerationLog): StudioTake {
    // Provider metadata (video_*) may be empty for some generators; the
    // stored client request carries the originals (ratio/resolution/duration).
    let prompt = '';
    let ratio = log.video_ratio ?? '';
    let resolution = log.video_resolution ?? '';
    let duration = log.video_duration ?? 0;
    let request: GenerateRequest | null = null;
    let refImages: StudioTakeRef[] = [];
    try {
      const req = JSON.parse(log.request ?? '{}') as GenerateRequest & {
        content?: { type?: string; text?: string; id?: string; name?: string }[];
      };
      prompt = (req.content ?? []).find((c) => c.type === 'text')?.text ?? '';
      ratio = ratio || req.ratio || '';
      resolution = resolution || req.resolution || '';
      duration = duration || req.duration || 0;
      request = req;
      refImages = (req.content ?? [])
        .filter((c) => c.type === 'image' && !!c.id)
        .map((c) => ({ id: c.id as string, name: c.name ?? c.id as string }));
    } catch {
      prompt = '';
    }
    const out = log.outputs?.[0];
    return {
      id: log.task_id,
      prompt,
      modelName: log.model_name,
      modelDisplayName: log.model_name,
      modelType: 'api',
      ratio,
      resolution,
      duration,
      status: this.mapStatus(log.status),
      progress: log.progress ?? 0,
      videoUrl: out?.localUrl ?? out?.url ?? null,
      error: log.error_message || null,
      createdAt: new Date(log.created_at).getTime(),
      ratingGood: !!log.rating_good,
      ratingFinal: !!log.rating_final,
      costCredits: log.cost_credits ?? 0,
      costUsd: log.estimated_cost ?? 0,
      transactionId: log.provider_transaction_id || null,
      eventName: log.event_name || null,
      userName: log.user_display_name || null,
      refImages,
      request,
    };
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
            this.notify(id);
            return EMPTY;
          }),
        )
        .subscribe((status) => {
          const out = status.outputs?.[0];
          const backend = status.status;
          const terminal = ['succeeded', 'completed', 'failed', 'cancelled'].includes(backend);
          const mapped = this.mapStatus(backend);
          this.patch(id, {
            status: mapped,
            progress: status.progress_percent ?? 0,
            videoUrl: out?.localUrl ?? out?.url ?? null,
            error: status.error ?? null,
          });
          if (terminal) {
            this.polling.delete(id);
            if (mapped === 'succeeded' || mapped === 'failed') {
              this.notify(id);
            }
          }
        });
    }
  }

  /** Flags a take as finished-and-unseen so the navbar badge surfaces it. */
  private notify(id: string): void {
    this._unread.update((list) => (list.includes(id) ? list : [...list, id]));
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
