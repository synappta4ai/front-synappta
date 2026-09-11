import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  NonNullableFormBuilder,
  Validators,
} from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tag } from 'primeng/tag';

import { VideoService } from '../../services/video.service';
import { AiModel, StatusResponse } from '@modules/agency/interfaces';
import { PageContainerComponent } from '@shared/components/index';

@Component({
  selector: 'app-video',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    PageContainerComponent,
    Button,
    Card,
    InputText,
    Textarea,
    InputNumber,
    Select,
    Message,
    ProgressSpinner,
    Tag,
  ],
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
  protected readonly loadingModels = signal(false);

  protected readonly models = signal<AiModel[]>([]);
  protected readonly selectedModel = signal<AiModel | null>(null);

  protected readonly durationOptions = signal<number[]>([5, 10]);

  protected readonly form = this.formBuilder.group({
    eventId: ['', Validators.required],
    pieceId: ['', Validators.required],
    pieceCode: ['', Validators.required],
    generationNumber: [1, [Validators.required, Validators.min(1)]],
    model: ['', Validators.required],
    prompt: ['', Validators.required],
    duration: [5, [Validators.required, Validators.min(4), Validators.max(15)]],
  });

  constructor() {
    this.loadModels();
  }

  protected loadModels(): void {
    this.loadingModels.set(true);
    this.videoService
      .listVideoModels()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos de video.');
          return EMPTY;
        }),
        finalize(() => this.loadingModels.set(false)),
      )
      .subscribe((models) => this.models.set(models));
  }

  protected onModelChange(model: AiModel | null): void {
    this.selectedModel.set(model);
    if (model) {
      this.form.patchValue({ model: model.name });
      if (model.defaults.durations?.length) {
        this.durationOptions.set(model.defaults.durations);
        const minDuration = model.defaults.durations[0];
        if (this.form.controls.duration.value < minDuration) {
          this.form.patchValue({ duration: minDuration });
        }
      }
    }
  }

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
