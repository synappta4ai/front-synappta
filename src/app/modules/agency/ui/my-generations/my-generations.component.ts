import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { GenerateRequest, GenerationLog } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';
import { ImgFadeDirective } from '@shared/components/img-fade/img-fade.directive';
import { PageContainerComponent } from '@shared/components/page-container/page-container.component';
import { downloadRemoteFile } from '@utils/download-url';

type TypeFilter = 'all' | 'video' | 'image';

interface TypeOption {
  value: TypeFilter;
  label: string;
  icon: string;
}

type StatusSeverity = 'success' | 'danger' | 'info' | 'warn' | 'secondary';

@Component({
  selector: 'app-my-generations',
  imports: [
    FormsModule,
    PageContainerComponent,
    Button,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Tag,
    DatePipe,
    DecimalPipe,
    ImgFadeDirective,
  ],
  providers: [ServerUrlPipe],
  templateUrl: './my-generations.component.html',
  styleUrl: './my-generations.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyGenerationsComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly router = inject(Router);
  private readonly serverUrl = inject(ServerUrlPipe);

  private readonly pageSize = 48;
  private cursorTo: string | null = null;

  protected readonly logs = signal<GenerationLog[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exhausted = signal(false);

  protected readonly typeFilter = signal<TypeFilter>('all');
  protected readonly search = signal('');
  protected readonly projectId = signal<string | null>(null);

  protected readonly typeOptions: TypeOption[] = [
    { value: 'all', label: 'Todas', icon: 'md md-grid_view' },
    { value: 'video', label: 'Videos', icon: 'md md-videocam' },
    { value: 'image', label: 'Imágenes', icon: 'md md-image' },
  ];

  protected readonly detailVisible = signal(false);
  protected readonly selected = signal<GenerationLog | null>(null);

  constructor() {
    this.load(true);
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  private load(reset: boolean): void {
    if (reset) {
      this.loading.set(true);
      this.error.set(null);
    } else {
      this.loadingMore.set(true);
    }

    const params: { limit: number; resource_type?: string; to?: string } = {
      limit: this.pageSize,
    };
    const type = this.typeFilter();
    if (type !== 'all') {
      params.resource_type = type;
    }
    if (!reset && this.cursorTo) {
      params.to = this.cursorTo;
    }

    this.agencyService
      .taskHistory(params)
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar tus generaciones.');
          return EMPTY;
        }),
        finalize(() => {
          if (reset) {
            this.loading.set(false);
          } else {
            this.loadingMore.set(false);
          }
        }),
      )
      .subscribe((rows) => {
        const list = rows ?? [];
        if (reset) {
          this.logs.set([...list]);
        } else {
          const seen = new Set(this.logs().map((log) => log.task_id));
          this.logs.set([...this.logs(), ...list.filter((log) => !seen.has(log.task_id))]);
        }
        this.exhausted.set(list.length < this.pageSize);
        this.cursorTo = list.length > 0 ? list[list.length - 1].created_at : null;
      });
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.cursorTo) {
      return;
    }
    this.load(false);
  }

  protected changeType(value: TypeFilter): void {
    if (this.typeFilter() === value) {
      return;
    }
    this.typeFilter.set(value);
    this.cursorTo = null;
    this.load(true);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.projectId.set(null);
    this.changeType('all');
  }

  // ── Vistas derivadas ─────────────────────────────────────────────────────

  protected readonly typeCounts = computed<Record<TypeFilter, number>>(() => {
    const logs = this.logs();
    return {
      all: logs.length,
      video: logs.filter((log) => this.isVideo(log)).length,
      image: logs.filter((log) => !this.isVideo(log)).length,
    };
  });

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    const projectId = this.projectId();
    return this.logs().filter((log) => {
      if (projectId && log.event_id !== projectId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        (log.model_name ?? '').toLowerCase().includes(query) ||
        (log.event_name ?? '').toLowerCase().includes(query) ||
        (log.piece_code ?? '').toLowerCase().includes(query) ||
        (log.piece_name ?? '').toLowerCase().includes(query) ||
        (log.task_id ?? '').toLowerCase().includes(query) ||
        (log.user_display_name ?? '').toLowerCase().includes(query)
      );
    });
  });

  protected readonly projectOptions = computed<{ label: string; value: string }[]>(() => {
    const map = new Map<string, string>();
    for (const log of this.logs()) {
      if (log.event_id) {
        map.set(log.event_id, log.event_name || 'Sin nombre');
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly totalCost = computed(() =>
    this.filtered().reduce((sum, log) => sum + (log.estimated_cost ?? 0), 0),
  );

  protected readonly totalCredits = computed(() =>
    this.filtered().reduce((sum, log) => sum + (log.cost_credits ?? 0), 0),
  );

  // ── Acciones ─────────────────────────────────────────────────────────────

  protected open(log: GenerationLog): void {
    this.selected.set(log);
    this.detailVisible.set(true);
  }

  protected close(): void {
    this.detailVisible.set(false);
    this.selected.set(null);
  }

  /** Reutiliza el prompt/payload original en el Studio (mismo flujo que Proyectos). */
  protected reuse(log: GenerationLog): void {
    if (!log.request) {
      this.error.set('Esta generación no tiene payload de origen para reutilizar.');
      return;
    }
    sessionStorage.setItem('studio:reuse', log.request);
    void this.router.navigate(['/studio']);
  }

  protected download(url: string, filename?: string): void {
    void downloadRemoteFile(url, filename);
  }

  protected absoluteUrl(url: string): string {
    return this.serverUrl.transform(url);
  }

  protected rate(log: GenerationLog, kind: 'good' | 'final'): void {
    const good = kind === 'good' ? !log.rating_good : false;
    const final = kind === 'final' ? !log.rating_final : false;
    this.patchLog(log, { rating_good: good, rating_final: final });
    this.agencyService
      .updateTaskRating(log.task_id, good, final)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo guardar la calificación.');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  protected clearRating(log: GenerationLog): void {
    this.patchLog(log, { rating_good: false, rating_final: false });
    this.agencyService
      .updateTaskRating(log.task_id, false, false)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo limpiar la calificación.');
          return EMPTY;
        }),
      )
      .subscribe();
  }

  private patchLog(log: GenerationLog, patch: Partial<GenerationLog>): void {
    this.logs.set(
      this.logs().map((row) =>
        row.task_id === log.task_id ? ({ ...row, ...patch } as GenerationLog) : row,
      ),
    );
    const selected = this.selected();
    if (selected && selected.task_id === log.task_id) {
      this.selected.set({ ...selected, ...patch } as GenerationLog);
    }
  }

  // ── Helpers de plantilla ─────────────────────────────────────────────────

  protected isVideo(log: GenerationLog): boolean {
    return (log.resource_type ?? 'video') !== 'image';
  }

  protected outputUrl(log: GenerationLog): string {
    const outputs = log.outputs ?? [];
    const out =
      outputs.find((output) => output.type === 'video') ??
      outputs.find((output) => output.type === 'image') ??
      outputs[0];
    return out?.localUrl || out?.url || '';
  }

  protected hasOutput(log: GenerationLog): boolean {
    return !!this.outputUrl(log);
  }

  protected downloadName(log: GenerationLog, url: string): string {
    const base = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '');
    if (base.includes('.')) {
      return base;
    }
    const ext = this.isVideo(log) ? 'mp4' : 'png';
    return `${log.task_id || 'generacion'}.${ext}`;
  }

  protected downloadOutput(log: GenerationLog, url: string): void {
    void downloadRemoteFile(url, this.downloadName(log, url));
  }

  protected statusLabel(status: string | null): string {
    switch (status) {
      case 'succeeded':
        return 'Completada';
      case 'completed':
        return 'Completada';
      case 'failed':
        return 'Fallida';
      case 'running':
        return 'En curso';
      case 'pending':
        return 'En espera';
      case 'cancelled':
        return 'Cancelada';
      case 'canceling':
        return 'Cancelando';
      default:
        return status ?? '—';
    }
  }

  protected severity(status: string | null): StatusSeverity {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'info';
      case 'pending':
      case 'canceling':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  protected cost(log: GenerationLog): number {
    return log.estimated_cost ?? 0;
  }

  protected duration(seconds: number | null): string {
    if (!seconds || seconds <= 0) {
      return '';
    }
    return `${seconds.toFixed(1)}s`;
  }

  protected promptOf(log: GenerationLog): string {
    if (!log.request) {
      return '';
    }
    try {
      const request = JSON.parse(log.request) as GenerateRequest;
      const text = (request.content ?? []).find((part) => part.type === 'text');
      return text?.text ?? '';
    } catch {
      return '';
    }
  }
}
