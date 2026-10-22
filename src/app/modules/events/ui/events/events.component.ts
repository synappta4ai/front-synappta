import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Tooltip } from 'primeng/tooltip';

import { EventsService } from '../../services/events.service';
import { Event } from '../../interfaces';
import { PageContainerComponent } from '@shared/components/index';

@Component({
  selector: 'app-events',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    PageContainerComponent,
    Button,
    Card,
    Checkbox,
    InputText,
    TableModule,
    Tag,
    Message,
    IconField,
    InputIcon,
    Tooltip,
    TranslatePipe,
  ],
  templateUrl: './events.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent {
  private readonly eventsService = inject(EventsService);
  private readonly translate = inject(TranslateService);

  protected readonly events = signal<readonly Event[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly newName = signal('');

  protected readonly showInactive = signal(false);

  constructor() {
    this.loadEvents();
  }

  protected loadEvents(): void {
    this.loading.set(true);
    this.error.set(null);
    this.eventsService
      .listEvents(this.showInactive())
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('EVENTS.ERRORS.LOAD'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((events) => this.events.set(events));
  }

  protected toggleShowInactive(): void {
    this.showInactive.update((value) => !value);
    this.loadEvents();
  }

  protected createEvent(): void {
    const name = this.newName().trim();
    if (!name) {
      return;
    }
    this.loading.set(true);
    this.eventsService
      .createEvent({ name })
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('EVENTS.ERRORS.CREATE'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe(() => {
        this.newName.set('');
        this.loadEvents();
      });
  }
}
