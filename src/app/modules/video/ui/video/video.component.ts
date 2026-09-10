import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  NonNullableFormBuilder,
  Validators,
} from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { VideoService } from '../../services/video.service';
import { StatusResponse } from '@modules/agency/interfaces';
import { PageContainerComponent } from '@shared/components/index';

@Component({
  selector: 'app-video',
  imports: [ReactiveFormsModule, PageContainerComponent],
  templateUrl: './video.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoComponent {
  private readonly videoService = inject(VideoService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly submitting = signal(false);
  protected readonly polling = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultUrl = signal<string | null>(null);

  protected readonly form = this.formBuilder.group({
    eventId: ['', Validators.required],
    pieceId: ['', Validators.required],
    pieceCode: ['', Validators.required],
    generationNumber: [1, [Validators.required, Validators.min(1)]],
    model: ['', Validators.required],
    prompt: ['', Validators.required],
    duration: [5, [Validators.required, Validators.min(4), Validators.max(15)]],
  });

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      model: value.model,
      content: [{ type: 'text' as const, text: value.prompt }],
      duration: value.duration,
      event_id: value.eventId,
      piece_id: value.pieceId,
      piece_code: value.pieceCode,
      generation_number: value.generationNumber,
    };

    this.submitting.set(true);
    this.error.set(null);
    this.resultUrl.set(null);

    this.videoService
      .generateVideo(payload)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo iniciar la generación.');
          this.submitting.set(false);
          return EMPTY;
        }),
      )
      .subscribe((response) => {
        this.submitting.set(false);
        this.polling.set(true);
        this.videoService
          .pollVideoUntilDone(response.taskId)
          .pipe(
            catchError(() => {
              this.error.set('Error al consultar el estado de la tarea.');
              this.polling.set(false);
              return EMPTY;
            }),
          )
          .subscribe((status: StatusResponse) => {
            if (status.status === 'succeeded') {
              this.resultUrl.set(status.outputs?.[0]?.url ?? null);
              this.polling.set(false);
            } else if (status.status === 'failed' || status.status === 'cancelled') {
              this.error.set(status.error ?? 'La generación falló.');
              this.polling.set(false);
            }
          });
      });
  }
}
