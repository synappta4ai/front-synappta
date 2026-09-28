import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from 'primeng/button';
import { Popover } from 'primeng/popover';
import { Tag } from 'primeng/tag';

import { GenerationEventsStore } from '@core/store/generation.events';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { StudioTake } from '@modules/studio/interfaces';

/**
 * Navbar notification bell: shows a popover with the events (videos/images)
 * currently being generated and their live percentage. Clicking an item
 * opens the /events page with that take focused.
 */
@Component({
  selector: 'app-generation-bell',
  imports: [RouterLink, Button, Popover, Tag, ServerUrlPipe],
  templateUrl: './generation-bell.component.html',
  styleUrl: './generation-bell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationBellComponent {
  protected readonly store = inject(GenerationEventsStore);
  private readonly popoverRef = viewChild.required<Popover>('popoverRef');

  /** Active events (queued/running) first, then the most recent finished. */
  protected readonly visible = computed<StudioTake[]>(() => {
    const events = this.store.events();
    const active = events.filter((e) => e.status === 'queued' || e.status === 'running');
    const recent = events.filter((e) => !active.includes(e)).slice(0, 3);
    return [...active, ...recent].slice(0, 8);
  });

  protected readonly hasActive = computed(() => this.store.activeCount() > 0);
  /** Finished takes not seen yet (bell shows the count, clears on open). */
  protected readonly unreadCount = computed(() => this.store.unreadCount());

  protected toggle(event: Event): void {
    // Opening the popover acknowledges everything the user can now see.
    if (this.unreadCount() > 0) {
      this.store.markAllRead();
    }
    this.popoverRef().toggle(event);
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

  protected shortPrompt(prompt: string): string {
    return prompt.length > 44 ? prompt.slice(0, 44) + '…' : prompt;
  }
}
