import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, EMPTY, finalize, forkJoin, of } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { Tabs, Tab, TabList, TabPanel, TabPanels } from 'primeng/tabs';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { Tooltip } from 'primeng/tooltip';

import { EventsService } from '@modules/events/services/events.service';
import { Event } from '@modules/events/interfaces';
import { AgencyService } from '@modules/agency/services';
import type { GenerationLog } from '@modules/agency/interfaces';
import { LibraryService } from '@modules/library/services';
import { ASSET_SECTIONS, isAssetSection } from '@modules/library/interfaces';
import type { FileAsset } from '@modules/library/interfaces';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { AssetPickerDialogComponent, PageContainerComponent } from '@shared/components/index';

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
    Tag,
    Message,
    Tabs,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    ConfirmDialog,
    AssetPickerDialogComponent,
    ServerUrlPipe,
    Tooltip,
  ],
  providers: [ConfirmationService],
  templateUrl: './projects.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsComponent {
  private readonly eventsService = inject(EventsService);
  private readonly agencyService = inject(AgencyService);
  private readonly libraryService = inject(LibraryService);
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
  /** Generaciones (videos/imágenes) hechas en el proyecto. */
  protected readonly generations = signal<readonly GenerationLog[]>([]);
  /** Recursos de la biblioteca asignados al proyecto. */
  protected readonly projectFiles = signal<readonly FileAsset[]>([]);
  protected readonly loadingDetail = signal(false);
  /** Diálogo de asignación de recursos de la biblioteca. */
  protected readonly assignDialogVisible = signal(false);
  protected readonly assigning = signal(false);
  /** Thumbs que fallaron al cargar (se muestra un placeholder). */
  private readonly brokenThumbs = signal<Set<string>>(new Set());

  // New entity dialogs
  protected readonly projectDialogVisible = signal(false);
  protected readonly saving = signal(false);

  protected readonly newProject = signal({ name: '', description: '', venue: '' });

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
      icon: 'md md-warning',
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
              this.generations.set([]);
              this.projectFiles.set([]);
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
    this.generations.set([]);
    this.projectFiles.set([]);
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: null } });
  }

  /** Carga las generaciones hechas en el proyecto y sus recursos asignados. */
  private loadDetail(projectId: string): void {
    this.loadingDetail.set(true);
    forkJoin({
      logs: this.agencyService
        .taskHistory({ event_id: projectId, limit: 200 })
        .pipe(catchError(() => of<GenerationLog[]>([]))),
      files: this.libraryService
        .listFilesByEvent(projectId)
        .pipe(catchError(() => of<FileAsset[]>([]))),
    })
      .pipe(finalize(() => this.loadingDetail.set(false)))
      .subscribe(({ logs, files }) => {
        this.generations.set(logs ?? []);
        this.projectFiles.set(files ?? []);
      });
  }

  /** Salida principal del log (video o imagen). */
  protected logOutput(log: GenerationLog): string {
    return log.outputs?.[0]?.localUrl || log.outputs?.[0]?.url || '';
  }

  protected isVideoLog(log: GenerationLog): boolean {
    return (log.resource_type ?? 'video') !== 'image';
  }

  /** Recursos agrupados por sección, igual que la galería de la biblioteca
      (Personaje / Ubicación / Props + Otros). */
  protected readonly fileGroups = computed<{ label: string; files: FileAsset[] }[]>(() => {
    const list = this.projectFiles();
    return [
      ...ASSET_SECTIONS.map((s) => ({
        label: s.label,
        files: list.filter((f) => f.category === s.key),
      })),
      { label: 'Otros recursos', files: list.filter((f) => !isAssetSection(f.category)) },
    ].filter((g) => g.files.length > 0);
  });

  protected openAssignDialog(): void {
    this.assignDialogVisible.set(true);
  }

  /** Confirma la asignación de recursos elegidos en el picker. */
  protected onAssignConfirmed(assets: FileAsset[]): void {
    const projectId = this.selectedProject()?.id;
    if (!projectId || !assets.length) {
      return;
    }
    this.assigning.set(true);
    forkJoin(
      assets.map((a) =>
        this.libraryService.linkFileEvent(a.id, projectId).pipe(
          catchError(() => {
            this.error.set(`No se pudo asignar "${a.filename}".`);
            return of(null);
          }),
        ),
      ),
    )
      .pipe(
        finalize(() => this.assigning.set(false)),
      )
      .subscribe(() => {
        this.flashSaved();
        this.loadDetail(projectId);
      });
  }

  /** Quita un recurso del proyecto (queda en la biblioteca). */
  protected unassignFile(file: FileAsset): void {
    const projectId = this.selectedProject()?.id;
    if (!projectId) {
      return;
    }
    this.libraryService
      .unlinkFileEvent(file.id, projectId)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo quitar el recurso.');
          return EMPTY;
        }),
      )
      .subscribe(() => this.loadDetail(projectId));
  }

  protected thumbBroken(id: string): boolean {
    return this.brokenThumbs().has(id);
  }

  protected markThumbBroken(id: string): void {
    this.brokenThumbs.update((set) => new Set(set).add(id));
  }

  protected logDate(log: GenerationLog): string {
    return new Date(log.created_at).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
    });
  }

  /** Alterna la calificación de una generación (una o ninguna, como el
      studio): parche optimista + persistencia en el backend. */
  protected rateLog(log: GenerationLog, kind: 'good' | 'final'): void {
    const good = kind === 'good' ? !log.rating_good : false;
    const final = kind === 'final' ? !log.rating_final : false;
    this.patchLog(log, { rating_good: good, rating_final: final });
    this.agencyService
      .updateTaskRating(log.task_id, good, final)
      .pipe(
        catchError(() => {
          this.patchLog(log, { rating_good: log.rating_good, rating_final: log.rating_final });
          this.error.set('No se pudo guardar la calificación.');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  /** Limpia la calificación de una generación. */
  protected clearLogRating(log: GenerationLog): void {
    this.patchLog(log, { rating_good: false, rating_final: false });
    this.agencyService
      .updateTaskRating(log.task_id, false, false)
      .pipe(
        catchError(() => {
          this.patchLog(log, { rating_good: log.rating_good, rating_final: log.rating_final });
          this.error.set('No se pudo guardar la calificación.');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private patchLog(log: GenerationLog, patch: Partial<GenerationLog>): void {
    this.generations.update((list) =>
      list.map((l) => (l.task_id === log.task_id ? { ...l, ...patch } : l)),
    );
  }

  /** Reusar desde /projects: manda el request al studio vía sessionStorage
      y navega; el studio lo aplica apenas carga el catálogo de modelos. */
  protected reuseLog(log: GenerationLog): void {
    if (log.request) {
      sessionStorage.setItem('studio:reuse', log.request);
    }
    this.router.navigate(['/studio']);
  }

  private flashSaved(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
