import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { Tooltip } from 'primeng/tooltip';

import { EventsService } from '@modules/events/services/events.service';
import { Event, Piece, Program, ProgramWithPieces } from '@modules/events/interfaces';
import { PageContainerComponent } from '@shared/components/index';

interface PieceTypeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-projects',
  imports: [
    FormsModule,
    PageContainerComponent,
    Button,
    Card,
    Checkbox,
    Dialog,
    InputText,
    Textarea,
    InputNumber,
    Select,
    Tag,
    Message,
    ProgressSpinner,
    ConfirmDialog,
    Tooltip,
  ],
  providers: [ConfirmationService],
  templateUrl: './projects.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent {
  private readonly eventsService = inject(EventsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // ─── State ──────────────────────────────────────────────────────
  protected readonly projects = signal<readonly Event[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly showInactive = signal(false);

  // Selected project detail
  protected readonly selectedProject = signal<Event | null>(null);
  protected readonly programs = signal<readonly ProgramWithPieces[]>([]);
  protected readonly loadingDetail = signal(false);

  // New entity dialogs
  protected readonly projectDialogVisible = signal(false);
  protected readonly programDialogVisible = signal(false);
  protected readonly pieceDialogVisible = signal(false);
  protected readonly saving = signal(false);

  protected readonly newProject = signal({ name: '', description: '', venue: '' });
  protected readonly newProgram = signal({ number: 1, name: '', description: '' });
  protected readonly newPiece = signal({
    program_id: '' as string,
    number: 1,
    piece_code: '',
    name: '',
    description: '',
    type: 'video',
    duration: 10,
    aspect_ratio: '16:9',
  });

  protected readonly pieceTypeOptions: PieceTypeOption[] = [
    { label: 'Video', value: 'video' },
    { label: 'Imagen', value: 'image' },
    { label: 'Texto', value: 'text' },
    { label: 'Flyer', value: 'flyer' },
    { label: 'Lower Third', value: 'lower_third' },
    { label: 'Otro', value: 'other' },
  ];

  protected readonly aspectRatioOptions = ['16:9', '9:16', '1:1', '4:3', '21:9'];

  constructor() {
    // Deep-link: /projects?project=<id> opens the detail panel directly.
    const projectId = this.route.snapshot.queryParamMap.get('project');
    this.loadProjects(projectId);
  }

  // ─── Projects ───────────────────────────────────────────────────
  protected loadProjects(selectId?: string | null): void {
    this.loading.set(true);
    this.error.set(null);
    this.eventsService
      .listEvents(this.showInactive())
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los proyectos.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((projects) => {
        this.projects.set(projects);
        if (selectId) {
          const target = projects.find((p) => p.id === selectId);
          if (target) {
            void this.selectProject(target);
          }
        }
      });
  }

  protected toggleShowInactive(): void {
    this.showInactive.update((value) => !value);
    this.loadProjects();
  }

  protected openProjectDialog(): void {
    this.newProject.set({ name: '', description: '', venue: '' });
    this.projectDialogVisible.set(true);
  }

  protected saveProject(): void {
    const data = this.newProject();
    if (!data.name.trim()) {
      return;
    }
    this.saving.set(true);
    this.eventsService
      .createEvent({
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        venue: data.venue.trim() || undefined,
      })
      .pipe(
        catchError(() => {
          this.error.set('No se pudo crear el proyecto.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((project) => {
        this.projectDialogVisible.set(false);
        this.flashSaved();
        this.loadProjects(project.id);
      });
  }

  protected confirmDeleteProject(project: Event): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el proyecto "${project.name}"? Se eliminarán también sus programas y piezas.`,
      header: 'Eliminar proyecto',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary' },
      accept: () => {
        this.eventsService
          .deleteEvent(project.id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo eliminar el proyecto.');
              return EMPTY;
            }),
          )
          .subscribe(() => {
            if (this.selectedProject()?.id === project.id) {
              this.selectedProject.set(null);
              this.programs.set([]);
            }
            this.loadProjects();
          });
      },
    });
  }

  // ─── Detail: programs + pieces ─────────────────────────────────
  protected selectProject(project: Event): void {
    this.selectedProject.set(project);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { project: project.id },
      queryParamsHandling: 'merge',
    });
    this.loadDetail(project.id);
  }

  protected closeDetail(): void {
    this.selectedProject.set(null);
    this.programs.set([]);
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: null } });
  }

  private loadDetail(projectId: string): void {
    this.loadingDetail.set(true);
    this.eventsService
      .getEvent(projectId)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo cargar el detalle del proyecto.');
          return EMPTY;
        }),
        finalize(() => this.loadingDetail.set(false)),
      )
      .subscribe((detail) => this.programs.set(detail.programs ?? []));
  }

  // ─── Programs ───────────────────────────────────────────────────
  protected openProgramDialog(): void {
    const programCount = this.programs().length;
    this.newProgram.set({ number: programCount + 1, name: '', description: '' });
    this.programDialogVisible.set(true);
  }

  protected saveProgram(): void {
    const project = this.selectedProject();
    const data = this.newProgram();
    if (!project || !data.number) {
      return;
    }
    this.saving.set(true);
    this.eventsService
      .createProgram(project.id, {
        number: data.number,
        name: data.name.trim() || undefined,
        description: data.description.trim() || undefined,
      })
      .pipe(
        catchError(() => {
          this.error.set('No se pudo crear el programa.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => {
        this.programDialogVisible.set(false);
        this.flashSaved();
        this.loadDetail(project.id);
      });
  }

  protected confirmDeleteProgram(program: Program): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el programa #${program.number}${program.name ? ` "${program.name}"` : ''}?`,
      header: 'Eliminar programa',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary' },
      accept: () => {
        const projectId = this.selectedProject()?.id;
        if (!projectId) {
          return;
        }
        this.eventsService
          .deleteProgram(program.id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo eliminar el programa.');
              return EMPTY;
            }),
          )
          .subscribe(() => this.loadDetail(projectId));
      },
    });
  }

  // ─── Pieces ─────────────────────────────────────────────────────
  protected openPieceDialog(programId?: string): void {
    const data = this.newPiece();
    const allPieces = this.programs().flatMap((p) => p.pieces);
    this.newPiece.set({
      ...data,
      program_id: programId ?? '',
      number: allPieces.length + 1,
    });
    this.pieceDialogVisible.set(true);
  }

  protected savePiece(): void {
    const project = this.selectedProject();
    const data = this.newPiece();
    if (!project || !data.number) {
      return;
    }
    this.saving.set(true);
    this.eventsService
      .createPiece(project.id, {
        program_id: data.program_id || undefined,
        number: data.number,
        piece_code: data.piece_code.trim() || undefined,
        name: data.name.trim() || undefined,
        description: data.description.trim() || undefined,
        type: data.type || undefined,
        duration: data.duration || undefined,
        aspect_ratio: data.aspect_ratio || undefined,
      })
      .pipe(
        catchError(() => {
          this.error.set('No se pudo crear la pieza.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => {
        this.pieceDialogVisible.set(false);
        this.flashSaved();
        this.loadDetail(project.id);
      });
  }

  protected confirmDeletePiece(piece: Piece): void {
    this.confirmationService.confirm({
      message: `¿Eliminar la pieza #${piece.number}${piece.name ? ` "${piece.name}"` : ''}?`,
      header: 'Eliminar pieza',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary' },
      accept: () => {
        const projectId = this.selectedProject()?.id;
        if (!projectId) {
          return;
        }
        this.eventsService
          .deletePiece(piece.id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo eliminar la pieza.');
              return EMPTY;
            }),
          )
          .subscribe(() => this.loadDetail(projectId));
      },
    });
  }

  /** Navigate to /video preconfigured with this piece. */
  protected generateForPiece(piece: Piece): void {
    this.router.navigate(['/video'], {
      queryParams: {
        event_id: piece.event_id,
        piece_id: piece.id,
        piece_code: piece.piece_code ?? '',
        generation_number: 1,
      },
    });
  }

  private flashSaved(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
