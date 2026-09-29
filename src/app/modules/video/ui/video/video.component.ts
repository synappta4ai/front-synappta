import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  NonNullableFormBuilder,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ProgressBar } from 'primeng/progressbar';
import { Tag } from 'primeng/tag';
import { Dialog } from 'primeng/dialog';

import { VideoService } from '../../services/video.service';
import { AiModel, StatusResponse } from '@modules/agency/interfaces';
import { EventsService } from '@modules/events/services/events.service';
import { Event as Project, Piece, Program } from '@modules/events/interfaces';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { PageContainerComponent, AssetPickerDialogComponent } from '@shared/components/index';
import { ServerUrlPipe } from '@pipes/server-url.pipe';

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
    ProgressBar,
    Tag,
    Dialog,
    ServerUrlPipe,
    AssetPickerDialogComponent,
  ],
  templateUrl: './video.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoComponent {
  private readonly videoService = inject(VideoService);
  private readonly eventsService = inject(EventsService);
  private readonly libraryService = inject(LibraryService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);

  protected readonly submitting = signal(false);
  protected readonly polling = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly loadingModels = signal(false);
  // Estimated generation progress (0-100) reported by the backend on each poll.
  protected readonly progress = signal(0);

  protected readonly models = signal<AiModel[]>([]);
  protected readonly selectedModel = signal<AiModel | null>(null);

  /** Durations the selected model supports, ascending. */
  protected readonly durationOptions = signal<number[]>([5, 10]);
  /** Inclusive [min, max] duration range of the selected model. */
  protected readonly durationRange = computed(() => {
    const opts = this.durationOptions();
    if (opts.length === 0) return { min: 4, max: 15 };
    return { min: Math.min(...opts), max: Math.max(...opts) };
  });
  /** Intermediate slider positions between the model's min and max. */
  protected readonly durationTicks = computed(() => {
    const { min, max } = this.durationRange();
    const steps = Math.min(6, max - min);
    if (steps <= 0) return [min];
    return Array.from({ length: steps + 1 }, (_, i) => min + Math.round((i * (max - min)) / steps));
  });

  // ─── Projects & pieces ─────────────────────────────────────────
  protected readonly projects = signal<readonly Project[]>([]);
  protected readonly loadingProjects = signal(false);
  protected readonly selectedProject = signal<Project | null>(null);

  protected readonly pieces = signal<readonly Piece[]>([]);
  protected readonly loadingPieces = signal(false);
  protected readonly selectedPiece = signal<Piece | null>(null);

  // Quick-create piece dialog
  protected readonly pieceDialogVisible = signal(false);
  protected readonly savingPiece = signal(false);
  protected readonly programs = signal<readonly Program[]>([]);
  protected readonly newPiece = signal({
    program_id: '' as string,
    name: '',
    piece_code: '',
    duration: 10,
    aspect_ratio: '16:9',
  });
  protected readonly aspectRatioOptions = ['16:9', '9:16', '1:1', '4:3', '21:9'];

  // ─── Imágenes de referencia del proyecto (centralización) ─────
  protected readonly refImages = signal<FileAsset[]>([]);
  protected readonly selectedRefIds = signal<Set<string>>(new Set());
  protected readonly loadingRefs = signal(false);
  protected readonly uploadingRef = signal(false);
  protected readonly maxSelectedRefs = 12;
  /** Modal de biblioteca para elegir referencias ya subidas. */
  protected readonly libraryPickerVisible = signal(false);

  protected readonly form = this.formBuilder.group({
    eventId: ['', Validators.required],
    pieceId: ['', Validators.required],
    pieceCode: ['', Validators.required],
    generationNumber: [1, [Validators.required, Validators.min(1)]],
    model: ['', Validators.required],
    prompt: ['', Validators.required],
    duration: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
  });

  constructor() {
    this.loadModels();
    this.loadProjects();
  }

  // ─── Referencias de imagen del proyecto ────────────────────────
  private loadRefImages(eventId: string): void {
    this.loadingRefs.set(true);
    this.libraryService
      .listFilesByEvent(eventId, 'images')
      .pipe(
        catchError(() => EMPTY),
        finalize(() => this.loadingRefs.set(false)),
      )
      .subscribe((files) => {
        this.refImages.set(files);
        // Keep only still-selected references that belong to this project.
        const valid = new Set(files.map((f) => f.id));
        this.selectedRefIds.update((prev) => new Set([...prev].filter((id) => valid.has(id))));
      });
  }

  protected toggleRef(id: string): void {
    const next = new Set(this.selectedRefIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= this.maxSelectedRefs) {
        return;
      }
      next.add(id);
    }
    this.selectedRefIds.set(next);
  }

  protected onRefPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const project = this.selectedProject();
    if (!file || !project) {
      input.value = '';
      return;
    }
    this.uploadingRef.set(true);
    this.libraryService
      .uploadFile(file, 'images', project.id)
      .pipe(
        catchError(() => {
          this.error.set(`No se pudo subir "${file.name}".`);
          return EMPTY;
        }),
        finalize(() => {
          this.uploadingRef.set(false);
          input.value = '';
        }),
      )
      .subscribe((asset) => {
        this.refImages.update((list) => [asset, ...list]);
        this.toggleRef(asset.id);
      });
  }

  /**
   * Recursos elegidos en la modal de biblioteca: se agregan a la lista de
   * referencias del proyecto y quedan seleccionados (hasta el máximo).
   */
  protected onLibraryPicked(picked: FileAsset[]): void {
    if (picked.length === 0) {
      return;
    }
    this.refImages.update((list) => {
      const known = new Set(list.map((a) => a.id));
      return [...list, ...picked.filter((p) => !known.has(p.id))];
    });
    const next = new Set(this.selectedRefIds());
    for (const p of picked) {
      if (next.size >= this.maxSelectedRefs) {
        break;
      }
      next.add(p.id);
    }
    this.selectedRefIds.set(next);
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

  // ─── Projects ──────────────────────────────────────────────────
  private loadProjects(preselectEventId?: string, preselectPieceId?: string): void {
    this.loadingProjects.set(true);
    this.eventsService
      .listEvents()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los proyectos.');
          return EMPTY;
        }),
        finalize(() => this.loadingProjects.set(false)),
      )
      .subscribe((projects) => {
        this.projects.set(projects);
        // Deep link from /projects ("Generar"): ?event_id=&piece_id=&generation_number=
        const qEventId = preselectEventId ?? this.route.snapshot.queryParamMap.get('event_id');
        const qPieceId = preselectPieceId ?? this.route.snapshot.queryParamMap.get('piece_id');
        const target = qEventId ? projects.find((p) => p.id === qEventId) : undefined;
        if (target) {
          this.onProjectChange(target, qPieceId ?? undefined);
        }
      });
  }

  protected onProjectChange(project: Project | null, preselectPieceId?: string): void {
    this.selectedProject.set(project);
    this.selectedPiece.set(null);
    this.pieces.set([]);
    this.form.patchValue({ eventId: '', pieceId: '', pieceCode: '' });
    if (!project) {
      this.refImages.set([]);
      this.selectedRefIds.set(new Set());
      return;
    }
    this.loadRefImages(project.id);
    this.loadingPieces.set(true);
    this.eventsService
      .listPieces({ event_id: project.id })
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar las piezas del proyecto.');
          return EMPTY;
        }),
        finalize(() => this.loadingPieces.set(false)),
      )
      .subscribe((pieces) => {
        this.pieces.set(pieces);
        const qPieceId = preselectPieceId ?? this.route.snapshot.queryParamMap.get('piece_id');
        const target = qPieceId ? pieces.find((p) => p.id === qPieceId) : undefined;
        if (target) {
          this.onPieceChange(target);
        }
      });
  }

  protected onPieceChange(piece: Piece | null): void {
    this.selectedPiece.set(piece);
    if (!piece) {
      this.form.patchValue({ pieceId: '', pieceCode: '' });
      return;
    }
    const patch: {
      eventId: string;
      pieceId: string;
      pieceCode: string;
      generationNumber?: number;
      duration?: number;
    } = {
      eventId: piece.event_id,
      pieceId: piece.id,
      pieceCode: piece.piece_code ?? `P${piece.number}`,
      generationNumber: 1,
    };
    // Adopt the piece's planned duration when within the selected model's range.
    const qGeneration = this.route.snapshot.queryParamMap.get('generation_number');
    if (qGeneration) {
      patch.generationNumber = Math.max(1, Number(qGeneration) || 1);
    }
    if (piece.duration) {
      const { min, max } = this.durationRange();
      patch.duration = Math.min(max, Math.max(min, piece.duration));
    }
    this.form.patchValue(patch);
  }

  // ─── Quick-create piece ────────────────────────────────────────
  protected openPieceDialog(): void {
    const project = this.selectedProject();
    if (!project) {
      return;
    }
    this.newPiece.set({
      program_id: '',
      name: '',
      piece_code: '',
      duration: this.durationOptions()[0] ?? 10,
      aspect_ratio: '16:9',
    });
    this.pieceDialogVisible.set(true);
    this.eventsService
      .listPrograms(project.id)
      .pipe(catchError(() => EMPTY))
      .subscribe((programs) => this.programs.set(programs));
  }

  protected savePiece(): void {
    const project = this.selectedProject();
    const data = this.newPiece();
    if (!project || !data.name.trim()) {
      return;
    }
    this.savingPiece.set(true);
    const allPieces = this.pieces();
    const nextNumber = allPieces.length + 1;
    this.eventsService
      .createPiece(project.id, {
        program_id: data.program_id || undefined,
        number: nextNumber,
        piece_code: data.piece_code.trim() || `P${nextNumber}`,
        name: data.name.trim(),
        type: 'video',
        duration: data.duration || undefined,
        aspect_ratio: data.aspect_ratio || undefined,
      })
      .pipe(
        catchError(() => {
          this.error.set('No se pudo crear la pieza.');
          return EMPTY;
        }),
        finalize(() => this.savingPiece.set(false)),
      )
      .subscribe((piece) => {
        this.pieceDialogVisible.set(false);
        // Reload pieces and select the freshly created one.
        this.eventsService
          .listPieces({ event_id: project.id })
          .pipe(catchError(() => EMPTY))
          .subscribe((pieces) => {
            this.pieces.set(pieces);
            this.onPieceChange(piece);
          });
      });
  }

  // ─── Model ─────────────────────────────────────────────────────
  /** p-select (onChange) bridge: resolves the chosen model and syncs limits. */
  protected onModelSelectEvent(event: { value?: string | null }): void {
    const name = event?.value ?? null;
    this.onModelChange(name ? (this.models().find((m) => m.name === name) ?? null) : null);
  }

  protected onModelChange(model: AiModel | null): void {
    this.selectedModel.set(model);
    if (model?.defaults.durations?.length) {
      this.durationOptions.set([...model.defaults.durations].sort((a, b) => a - b));
    } else {
      this.durationOptions.set([5, 10]);
    }
    // Clamp the current duration into the new model's supported range.
    const { min, max } = this.durationRange();
    const current = this.form.controls.duration.value;
    if (current < min || current > max) {
      this.form.patchValue({ duration: Math.min(max, Math.max(min, current)) });
    }
  }

  /** Slider input handler: keeps the numeric form control in sync. */
  protected onDurationInput(value: number | string): void {
    const duration = Number(value);
    if (Number.isFinite(duration)) {
      this.form.controls.duration.setValue(duration);
    }
  }

  // ─── Submit ────────────────────────────────────────────────────
  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      model: value.model,
      content: [
        { type: 'text' as const, text: value.prompt },
        // Imágenes de referencia del proyecto seleccionadas (centralización).
        ...this.refImages()
          .filter((f) => this.selectedRefIds().has(f.id))
          .map((f) => ({ type: 'image' as const, id: f.id, name: f.filename })),
      ],
      duration: value.duration,
      event_id: value.eventId,
      piece_id: value.pieceId,
      piece_code: value.pieceCode,
      generation_number: value.generationNumber,
    };

    this.submitting.set(true);
    this.error.set(null);
    this.resultUrl.set(null);
    this.progress.set(0);

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
            if (typeof status.progress_percent === 'number') {
              this.progress.set(status.progress_percent);
            }
            if (status.status === 'succeeded') {
              // Prefer the server-owned copy over the expiring provider URL.
              const out = status.outputs?.[0];
              this.resultUrl.set(out?.localUrl ?? out?.url ?? null);
              this.polling.set(false);
            } else if (status.status === 'failed' || status.status === 'cancelled') {
              this.error.set(status.error ?? 'La generación falló.');
              this.polling.set(false);
            }
          });
      });
  }
}
