import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';

import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { GenerationEventsStore } from '@core/store/generation.events';

import { StudioTake } from '../../interfaces';

type Filter = 'all' | 'active' | 'done';

@Component({
  selector: 'app-generation-events',
  imports: [RouterLink, Button, Tag, ServerUrlPipe],
  templateUrl: './generation-events.component.html',
  styleUrl: './generation-events.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationEventsComponent {
  protected readonly store = inject(GenerationEventsStore);

  protected readonly filter = signal<Filter>('all');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly filtered = computed(() => {
    const list = this.store.events();
    switch (this.filter()) {
      case 'active':
        return list.filter((e) => e.status === 'queued' || e.status === 'running');
      case 'done':
        return list.filter((e) => e.status === 'succeeded');
      default:
        return list;
    }
  });

  protected readonly selected = computed<StudioTake | null>(
    () => this.filtered().find((e) => e.id === this.selectedId()) ?? this.filtered()[0] ?? null,
  );

  protected setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  protected select(take: StudioTake): void {
    this.selectedId.set(take.id);
  }

  protected cancel(take: StudioTake): void {
    this.store.cancel(take.id);
  }

  protected discard(take: StudioTake): void {
    this.store.remove(take.id);
  }

  protected severity(status: StudioTake['status']): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'info';
      case 'cancelled':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  protected label(status: StudioTake['status']): string {
    const labels: Record<StudioTake['status'], string> = {
      queued: 'En cola',
      running: 'Generando',
      succeeded: 'Listo',
      failed: 'Error',
      cancelled: 'Cancelado',
    };
    return labels[status];
  }

  protected time(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
