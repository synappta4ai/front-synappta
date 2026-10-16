import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { GenerationEventsStore } from '@core/store/generation.events';
import { SlidePillDirective } from '@shared/components/slide-pill/slide-pill.directive';
import { TiltDirective } from '@shared/components/tilt/tilt.directive';

import { StudioTake } from '../../interfaces';

type Filter = 'all' | 'active' | 'done';

@Component({
  selector: 'app-generation-events',
  imports: [
    RouterLink,
    Button,
    Tag,
    ConfirmDialog,
    ServerUrlPipe,
    SlidePillDirective,
    TiltDirective,
    DatePipe,
    DecimalPipe,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './generation-events.component.html',
  styleUrl: './generation-events.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationEventsComponent {
  protected readonly store = inject(GenerationEventsStore);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);

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
    this.confirmationService.confirm({
      message: this.translate.instant('STUDIO.EVENTS.CONFIRM_DISCARD_MESSAGE'),
      header: this.translate.instant('STUDIO.EVENTS.CONFIRM_DISCARD_TITLE'),
      icon: 'md md-warning',
      acceptButtonProps: {
        label: this.translate.instant('STUDIO.EVENTS.CONFIRM_DISCARD_ACCEPT'),
        severity: 'danger',
      },
      rejectButtonProps: {
        label: this.translate.instant('STUDIO.EVENTS.CONFIRM_DISCARD_REJECT'),
        severity: 'secondary',
      },
      accept: () => this.store.remove(take.id),
    });
  }

  protected severity(
    status: StudioTake['status'],
  ): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
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
      queued: this.translate.instant('STUDIO.STATUS_QUEUED'),
      running: this.translate.instant('STUDIO.STATUS_RUNNING'),
      succeeded: this.translate.instant('STUDIO.STATUS_SUCCEEDED'),
      failed: this.translate.instant('STUDIO.STATUS_FAILED'),
      cancelled: this.translate.instant('STUDIO.STATUS_CANCELLED'),
    };
    return labels[status];
  }
}
