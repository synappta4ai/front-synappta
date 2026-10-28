import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Dialog } from 'primeng/dialog';

import { GenerationLog } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';
import { ServerUrlPipe } from '@pipes/server-url.pipe';

import { EditorAsset } from '../../interfaces';
import { EditorService } from '../../services';
import { daysAgo, groupByDay } from '../../utils/day-groups';
import { createId, formatTime, sourceFor } from '../../utils/timeline';
import { firstValueFrom } from 'rxjs';

type GenFilter = 'all' | 'video' | 'image';

interface GenItem {
  key: string;
  createdAt: string;
  name: string;
  kind: 'video' | 'image';
  url: string;
  /** Miniatura: la imagen misma o el póster que genera el servidor. */
  thumb: string;
  duration: number;
  time: string;
  /** El servidor puede leerlo (local o bucket del tenant); los de proveedor externo no. */
  usable: boolean;
}

const PAGE_SIZE = 100;

/**
 * Modal "Importar generaciones": todo lo generado por el usuario, agrupado por
 * día y con cada día colapsable. Solo el día más reciente arranca abierto, y los
 * días cerrados no pintan nada (las miniaturas de los demás no se piden).
 */
@Component({
  selector: 'app-import-generations-dialog',
  imports: [Dialog, TranslatePipe, ServerUrlPipe],
  providers: [ServerUrlPipe],
  templateUrl: './import-generations-dialog.component.html',
  styleUrl: './import-generations-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportGenerationsDialogComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly editorService = inject(EditorService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  /** Los assets elegidos, ya con forma de EditorAsset (duration 0 si se desconoce). */
  readonly imported = output<EditorAsset[]>();

  protected readonly filters: readonly GenFilter[] = ['all', 'video', 'image'];
  protected readonly filter = signal<GenFilter>('all');
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal(false);
  protected readonly exhausted = signal(false);
  protected readonly items = signal<GenItem[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  private readonly expanded = signal<Readonly<Record<string, boolean>>>({});
  private cursor: string | null = null;
  private loadedOnce = false;
  private readonly postersRequested = new Set<string>();

  protected readonly groups = computed(() => {
    this.translate.currentLang();
    const f = this.filter();
    const visibleItems = f === 'all' ? this.items() : this.items().filter((i) => i.kind === f);
    const today = new Date();
    return groupByDay(visibleItems, (i) => i.createdAt).map((g) => ({
      key: g.key,
      label: this.dayLabel(g.date, today),
      items: g.items,
      selectable: g.items.filter((i) => i.usable).length,
    }));
  });

  protected readonly selectedCount = computed(() => this.selected().size);

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => {
          this.selected.set(new Set());
          if (!this.loadedOnce) {
            this.loadedOnce = true;
            this.load(true);
          }
        });
      }
    });
  }

  protected isOpen(key: string): boolean {
    const explicit = this.expanded()[key];
    return explicit ?? key === this.groups()[0]?.key;
  }

  protected toggleDay(key: string): void {
    const open = this.isOpen(key);
    this.expanded.update((m) => ({ ...m, [key]: !open }));
    if (!open) {
      const group = this.groups().find((g) => g.key === key);
      if (group) {
        this.loadPosters(group.items);
      }
    }
  }

  /**
   * Pide al servidor el póster de los videos visibles (se cachea en disco y se
   * sirve como imagen estática). Solo se piden los del día abierto.
   */
  private loadPosters(items: readonly GenItem[]): void {
    const targets = items
      .filter(
        (i) => i.kind === 'video' && i.usable && !i.thumb && !this.postersRequested.has(i.key),
      )
      .slice(0, 12);
    for (const target of targets) {
      this.postersRequested.add(target.key);
    }
    const queue = [...targets];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const source = sourceFor(item.url);
        if (!source) {
          continue;
        }
        try {
          const res = await firstValueFrom(
            this.editorService.poster({ fileId: source.file_id, output: source.output }),
          );
          if (res?.url) {
            this.items.update((list) =>
              list.map((i) => (i.key === item.key ? { ...i, thumb: res.url } : i)),
            );
          }
        } catch {
          /* sin póster: queda el ícono */
        }
      }
    };
    void Promise.all([worker(), worker()]);
  }

  protected isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  protected toggleItem(item: GenItem): void {
    if (!item.usable) {
      return;
    }
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(item.key)) {
        next.add(item.key);
      }
      return next;
    });
  }

  /** Marca o desmarca todo lo usable de un día. */
  protected toggleDaySelection(items: readonly GenItem[]): void {
    const usable = items.filter((i) => i.usable);
    this.selected.update((s) => {
      const next = new Set(s);
      const all = usable.every((i) => next.has(i.key));
      for (const i of usable) {
        if (all) {
          next.delete(i.key);
        } else {
          next.add(i.key);
        }
      }
      return next;
    });
  }

  protected allSelected(items: readonly GenItem[]): boolean {
    const usable = items.filter((i) => i.usable);
    return usable.length > 0 && usable.every((i) => this.selected().has(i.key));
  }

  protected loadMore(): void {
    if (!this.loadingMore() && !this.exhausted()) {
      this.load(false);
    }
  }

  protected confirm(): void {
    const chosen = this.items().filter((i) => this.selected().has(i.key));
    if (chosen.length === 0) {
      return;
    }
    const assets: EditorAsset[] = chosen.map((i) => ({
      id: createId(),
      kind: i.kind,
      name: i.name,
      url: i.url,
      thumb: i.kind === 'image' ? i.url : '',
      duration: i.kind === 'video' ? i.duration : 0,
    }));
    this.imported.emit(assets);
    this.close();
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected formatDuration(seconds: number): string {
    return formatTime(seconds).slice(0, -2);
  }

  private load(reset: boolean): void {
    if (reset) {
      this.loading.set(true);
      this.error.set(false);
    } else {
      this.loadingMore.set(true);
    }
    const params: { limit: number; to?: string } = { limit: PAGE_SIZE };
    if (!reset && this.cursor) {
      params.to = this.cursor;
    }
    this.agencyService
      .taskHistory(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const list = rows ?? [];
          const mapped = this.toItems(list);
          const seen = new Set(reset ? [] : this.items().map((i) => i.key));
          this.items.update((prev) => [
            ...(reset ? [] : prev),
            ...mapped.filter((i) => !seen.has(i.key)),
          ]);
          this.exhausted.set(list.length < PAGE_SIZE);
          this.cursor = list.length > 0 ? list[list.length - 1].created_at : this.cursor;
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
          this.loadingMore.set(false);
          if (reset) {
            this.loadedOnce = false;
          }
        },
      });
  }

  private toItems(rows: readonly GenerationLog[]): GenItem[] {
    const out: GenItem[] = [];
    const lang = this.translate.currentLang() ?? 'es';
    const clock = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    for (const log of rows) {
      if (log.status !== 'succeeded') {
        continue;
      }
      for (const [n, o] of (log.outputs ?? []).entries()) {
        if (o.type !== 'video' && o.type !== 'image') {
          continue;
        }
        const url = o.localUrl || o.url;
        const created = new Date(log.created_at);
        out.push({
          key: `${log.id}:${n}`,
          createdAt: log.created_at,
          name: log.piece_name || log.event_name || log.model_name,
          kind: o.type,
          url,
          thumb: o.type === 'image' ? url : '',
          duration: o.type === 'video' && log.video_duration > 0 ? log.video_duration : 0,
          time: Number.isNaN(created.getTime()) ? '' : clock.format(created),
          usable: sourceFor(url) !== null,
        });
      }
    }
    return out;
  }

  private dayLabel(date: Date, today: Date): string {
    const ago = daysAgo(date, today);
    if (ago === 0) {
      return this.translate.instant('EDITOR.IMPORT_DIALOG.TODAY');
    }
    if (ago === 1) {
      return this.translate.instant('EDITOR.IMPORT_DIALOG.YESTERDAY');
    }
    const lang = this.translate.currentLang() ?? 'es';
    return new Intl.DateTimeFormat(lang, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
