import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, tap } from 'rxjs';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { Tooltip } from 'primeng/tooltip';
import { ProgressSpinner } from 'primeng/progressspinner';

import { UserSessionStore } from '@core/store/user.session';
import { AdminService } from '../../services/admin.service';
import { GeneratedVideo, WorkerArtifact } from '../../interfaces';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { formatDurationValue } from '@pipes/format-duration.pipe';
import { TiltDirective } from '@shared/components/tilt/tilt.directive';

@Component({
  selector: 'app-admin-videos',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    Button,
    InputText,
    TableModule,
    Tag,
    Message,
    Dialog,
    ProgressSpinner,
    Tooltip,
    ServerUrlPipe,
    TiltDirective,
    TranslatePipe,
  ],
  templateUrl: './admin-videos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVideosComponent {
  private readonly adminService = inject(AdminService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly translate = inject(TranslateService);

  protected readonly isSuperadmin = computed(
    () => this.sessionStore.currentUser()?.role_level === 0,
  );

  protected readonly videos = signal<GeneratedVideo[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly limit = 12;
  protected readonly search = signal('');

  protected readonly selected = signal<GeneratedVideo | null>(null);
  protected readonly playerVisible = signal(false);

  // ─── Worker artifacts ─────────────────────────────────────────────
  protected readonly workerArtifacts = signal<WorkerArtifact[]>([]);
  protected readonly loadingArtifacts = signal(false);
  protected readonly deletingArtifact = signal<Record<string, boolean>>({});

  constructor() {
    this.load();
    this.loadWorkerArtifacts();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService
      .listGeneratedVideos(this.page(), this.limit)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.VIDEOS.ERRORS.LOAD'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((pageData) => {
        this.videos.set(pageData.logs ?? []);
        this.total.set(pageData.total);
      });
  }

  protected filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.videos();
    return this.videos().filter(
      (v) =>
        v.task_id.toLowerCase().includes(q) ||
        (v.event_name ?? '').toLowerCase().includes(q) ||
        (v.piece_code ?? '').toLowerCase().includes(q) ||
        (v.piece_name ?? '').toLowerCase().includes(q),
    );
  });

  protected prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.load();
    }
  }

  protected nextPage(): void {
    if (this.page() * this.limit < this.total()) {
      this.page.set(this.page() + 1);
      this.load();
    }
  }

  protected hasPrev = computed(() => this.page() > 1);
  protected hasNext = computed(() => this.page() * this.limit < this.total());

  protected openPlayer(video: GeneratedVideo): void {
    this.selected.set(video);
    this.playerVisible.set(true);
  }

  /** First video output URL (server-relative), resolved by serverUrl pipe in template. */
  protected outputUrl(video: GeneratedVideo): string {
    const out = video.outputs?.find((o) => o.type === 'video') ?? video.outputs?.[0];
    return out?.localUrl || out?.url || '';
  }

  protected formatDuration(seconds: number): string {
    return formatDurationValue(seconds, 's');
  }

  // ─── Worker artifacts ─────────────────────────────────────────────

  protected loadWorkerArtifacts(): void {
    this.loadingArtifacts.set(true);
    this.adminService
      .listWorkerArtifacts()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.VIDEOS.ERRORS.LOAD_ARTIFACTS'));
          return EMPTY;
        }),
        finalize(() => this.loadingArtifacts.set(false)),
      )
      .subscribe((artifacts) => this.workerArtifacts.set(artifacts ?? []));
  }

  protected isDeletingArtifact(name: string): boolean {
    return !!this.deletingArtifact()[name];
  }

  protected deleteWorkerArtifact(name: string): void {
    this.deletingArtifact.update((d) => ({ ...d, [name]: true }));
    this.error.set(null);
    this.adminService
      .deleteWorkerArtifact(name)
      .pipe(
        tap(() => this.loadWorkerArtifacts()),
        catchError((err: unknown) => {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message)
              : null;
          this.error.set(msg || this.translate.instant('ADMIN.VIDEOS.ERRORS.DELETE_ARTIFACT'));
          return EMPTY;
        }),
        finalize(() => {
          this.deletingArtifact.update((d) => {
            const { [name]: _removed, ...rest } = d;
            return rest;
          });
        }),
      )
      .subscribe();
  }

  /** Formatea bytes para mostrar en la UI. */
  protected formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
