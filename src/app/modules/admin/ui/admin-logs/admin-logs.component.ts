import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { Dialog } from 'primeng/dialog';
import { Tabs, Tab, TabList, TabPanel, TabPanels } from 'primeng/tabs';
import { Tooltip } from 'primeng/tooltip';

import { UserSessionStore } from '@core/store/user.session';
import { AdminService } from '../../services/admin.service';
import { ServerCommunicationLog } from '../../interfaces';

/**
 * One logical record: the generation submit, the provider spend estimate
 * (phase "estimate", when the provider reports one) and the latest polling
 * trace.
 */
interface CommRow {
  task_id: string;
  generate: ServerCommunicationLog | null;
  estimate: ServerCommunicationLog | null;
  poll: ServerCommunicationLog | null;
}

/** A phase tab inside the detail dialog. */
interface PhaseTab {
  value: string;
  label: string;
  icon: string;
  badge: string;
  comm: ServerCommunicationLog | null;
}

@Component({
  selector: 'app-admin-logs',
  imports: [
    FormsModule,
    DatePipe,
    Button,
    InputText,
    TableModule,
    Tag,
    Message,
    Dialog,
    Tabs,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tooltip,
  ],
  templateUrl: './admin-logs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLogsComponent {
  private readonly adminService = inject(AdminService);
  private readonly sessionStore = inject(UserSessionStore);

  protected readonly isSuperadmin = computed(
    () => this.sessionStore.currentUser()?.role_level === 0,
  );

  protected readonly comms = signal<ServerCommunicationLog[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly limit = 20;
  protected readonly taskIdFilter = signal('');

  protected readonly detail = signal<CommRow | null>(null);
  protected readonly detailVisible = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService
      .listServerComms(this.page(), this.limit, this.taskIdFilter().trim() || undefined)
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los logs.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((page) => {
        this.comms.set(page.logs);
        this.total.set(page.total);
      });
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

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

  /**
   * Merges the submit trace (phase "generate") and the polling trace
   * (phase "poll") of the same task into a single row per task, newest
   * task first. Legacy rows without phase are classified by HTTP method.
   */
  protected readonly rows = computed<CommRow[]>(() => {
    const byTask = new Map<string, CommRow>();
    for (const c of this.comms()) {
      const key = c.task_id || `id:${c.id}`;
      let row = byTask.get(key);
      if (!row) {
        row = { task_id: c.task_id, generate: null, estimate: null, poll: null };
        byTask.set(key, row);
      }
      if (c.phase === 'estimate') {
        // Provider spend estimate (credits + USD reported by the API).
        if (!row.estimate) row.estimate = c;
      } else if (c.phase === 'poll' || c.method === 'GET') {
        // List comes newest-first: the first poll seen is the latest.
        if (!row.poll) row.poll = c;
      } else if (!row.generate) {
        row.generate = c;
      }
    }
    const rows = [...byTask.values()];
    rows.sort((a, b) => this.rowDate(b).getTime() - this.rowDate(a).getTime());
    return rows;
  });

  protected openDetail(row: CommRow): void {
    this.detail.set(row);
    this.detailVisible.set(true);
  }

  /** Latest activity timestamp of a merged row (poll finish → submit). */
  protected rowDate(r: CommRow): Date {
    const raw = r.poll?.finished_at || r.poll?.created_at || r.generate?.created_at;
    return raw ? new Date(raw) : new Date(0);
  }

  /** Aggregate event of the merged row: terminal poll status or in-progress. */
  protected rowEvent(r: CommRow): { label: string; severity: 'success' | 'danger' | 'info' } {
    const p = r.poll;
    if (p) {
      if (p.status_code === 0 || p.error_message) return { label: 'ERROR', severity: 'danger' };
      if (p.status_code >= 400) return { label: String(p.status_code), severity: 'danger' };
      return { label: 'COMPLETADO', severity: 'success' };
    }
    return { label: 'EN CURSO', severity: 'info' };
  }

  /** Final HTTP status shown in the table: terminal poll or submit. */
  protected rowStatusCode(r: CommRow): number {
    return r.poll?.status_code ?? r.generate?.status_code ?? 0;
  }

  /** Wall-clock time shown in the table: submit→result span, or submit call. */
  protected rowDuration(r: CommRow): string {
    if ((r.poll?.total_duration_ms ?? 0) > 0) return this.formatMs(r.poll!.total_duration_ms);
    if ((r.generate?.duration_ms ?? 0) > 0) return this.formatMs(r.generate!.duration_ms);
    return '—';
  }

  protected rowDurationTitle(r: CommRow): string {
    if ((r.poll?.total_duration_ms ?? 0) > 0) return 'Tiempo total: envío → resultado';
    if ((r.generate?.duration_ms ?? 0) > 0) return 'Solo la llamada de envío (aún sin resultado)';
    return '';
  }

  protected formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rest = Math.round(s - m * 60);
    return `${m}m ${rest}s`;
  }

  /** Elapsed time since submit for tasks still without a terminal poll. */
  protected elapsedSinceStart(r: CommRow): string {
    const raw = r.generate?.started_at || r.generate?.created_at;
    if (!raw) return '';
    return this.formatMs(Math.max(0, Date.now() - new Date(raw).getTime()));
  }

  /** The phase tabs of the detail dialog for a merged row. */
  protected phases(r: CommRow): PhaseTab[] {
    const pollBadge = `POLLING ×${r.poll?.poll_count ?? 0}`;
    const tabs: PhaseTab[] = [
      {
        value: 'generation',
        label: 'Generación',
        icon: 'md md-upload',
        badge: 'ENVÍO',
        comm: r.generate,
      },
    ];
    if (r.estimate) {
      tabs.push({
        value: 'estimate',
        label: 'Gasto estimado',
        icon: 'md md-description',
        badge: 'GASTO',
        comm: r.estimate,
      });
    }
    tabs.push({
      value: 'polling',
      label: 'Último polling',
      icon: 'md md-refresh',
      badge: pollBadge,
      comm: r.poll,
    });
    return tabs;
  }

  /** Provider-reported spend parsed from the estimate trace (null = none). */
  protected rowCost(r: CommRow): { credits: number; usd: number } | null {
    const raw = r.estimate?.response_body;
    if (!raw) return null;
    try {
      const j = JSON.parse(raw) as { credits?: unknown; usd?: unknown };
      const credits = Number(j.credits);
      const usd = Number(j.usd);
      if (!Number.isFinite(credits) && !Number.isFinite(usd)) return null;
      return {
        credits: Number.isFinite(credits) ? credits : 0,
        usd: Number.isFinite(usd) ? usd : 0,
      };
    } catch {
      return null;
    }
  }

  /** Compact spend for the table cell: "$0.094 · 1.5 cr". */
  protected formatCost(cost: { credits: number; usd: number }): string {
    const parts: string[] = [];
    if (cost.usd > 0) parts.push(`$${Math.round(cost.usd * 1000) / 1000}`);
    if (cost.credits > 0) parts.push(`${Math.round(cost.credits * 100) / 100} cr`);
    return parts.join(' · ');
  }

  protected statusSeverity(status: number): 'success' | 'danger' | 'warn' {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400) return 'danger';
    return 'warn';
  }

  protected statusLabel(status: number): string {
    return String(status);
  }

  protected authTypeLabel(authType: string): string {
    switch (authType) {
      case 'bearer':
        return 'API Key';
      case 'ak_sk':
        return 'AK/SK';
      default:
        return authType || '—';
    }
  }

  /** Pretty-prints JSON bodies; plain text (or empty) falls back to the raw value. */
  protected prettyBody(raw: string | undefined): string {
    if (!raw) return '';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  /** True when the body parses as JSON, to switch the viewer font. */
  protected isJson(raw: string | undefined): boolean {
    if (!raw) return false;
    try {
      return typeof JSON.parse(raw) === 'object';
    } catch {
      return false;
    }
  }

  protected copyBody(raw: string | undefined, event: Event): void {
    const value = this.prettyBody(raw);
    if (!value) return;
    const button = event.currentTarget as HTMLElement;
    navigator.clipboard.writeText(value).then(
      () => {
        const icon = button.querySelector('i');
        if (icon) {
          icon.className = 'md md-check text-success';
          setTimeout(() => (icon.className = 'md md-content_copy'), 1500);
        }
      },
      () => {},
    );
  }
}
