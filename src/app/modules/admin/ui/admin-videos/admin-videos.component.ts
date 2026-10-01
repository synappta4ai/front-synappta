import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Dialog } from 'primeng/dialog';
import { Tooltip } from 'primeng/tooltip';

import { UserSessionStore } from '@core/store/user.session';
import { AdminService } from '../../services/admin.service';
import { GeneratedVideo } from '../../interfaces';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
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
    ProgressSpinner,
    Dialog,
    Tooltip,
    ServerUrlPipe,
    TiltDirective,
  ],
  templateUrl: './admin-videos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVideosComponent {
  private readonly adminService = inject(AdminService);
  private readonly sessionStore = inject(UserSessionStore);

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

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService
      .listGeneratedVideos(this.page(), this.limit)
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los videos generados.');
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
    if (!seconds || seconds <= 0) return '—';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
}
