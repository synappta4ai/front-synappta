import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, forkJoin } from 'rxjs';

import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { FormatBytesPipe } from '@pipes/format-bytes.pipe';

import { AdminService } from '../../services/admin.service';
import { WorkerModel, WorkerStatus } from '../../interfaces';

/**
 * GPU / worker de inferencia: estado en vivo de la máquina que sirve los
 * modelos descargados. Es infraestructura de plataforma, no del tenant; las
 * GPUs que empareja cada empresa se gestionan en "Tu GPU".
 */
@Component({
  selector: 'app-admin-gpu',
  imports: [Button, Message, ProgressSpinner, Tag, Tooltip, FormatBytesPipe, TranslatePipe],
  templateUrl: './admin-gpu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGpuComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly status = signal<WorkerStatus | null>(null);
  protected readonly models = signal<WorkerModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly downloaded = computed(() => this.models().filter((model) => model.downloaded));

  protected readonly weightsBytes = computed(() =>
    this.downloaded().reduce((total, model) => total + model.size_bytes, 0),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      status: this.adminService.workerStatus().pipe(catchError(() => EMPTY)),
      models: this.adminService.listWorkerModels().pipe(catchError(() => EMPTY)),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe(({ status, models }) => {
        this.status.set(status ?? null);
        this.models.set(models ?? []);
        if (!status) {
          this.error.set(this.translate.instant('ADMIN.GPU.ERRORS.LOAD'));
        }
      });
  }

  protected goToModels(): void {
    void this.router.navigate(['/admin/models']);
  }

  protected goToPairing(): void {
    void this.router.navigate(['/gpu']);
  }
}
