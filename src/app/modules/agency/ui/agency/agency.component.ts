import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { AgencyService } from '../../services/agency.service';
import { AiModel, Modality } from '../../interfaces';
import { PageContainerComponent } from '@shared/components/index';

@Component({
  selector: 'app-agency',
  imports: [PageContainerComponent],
  templateUrl: './agency.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgencyComponent {
  private readonly agencyService = inject(AgencyService);

  protected readonly models = signal<readonly AiModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly modalities: readonly Modality[] = ['video', 'image', 'text'];

  constructor() {
    this.loadModels();
  }

  protected loadModels(): void {
    this.loading.set(true);
    this.error.set(null);
    this.agencyService
      .listModels()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((models) => this.models.set(models));
  }
}
