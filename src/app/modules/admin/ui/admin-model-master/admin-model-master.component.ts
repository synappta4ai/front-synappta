import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

import { AiModel, MasterModelPref, Modality } from '@modules/agency/interfaces';

import { AdminService } from '../../services/admin.service';

interface MasterRow {
  name: string;
  model: AiModel | null;
  enabled: boolean;
  /** Una o varias etiquetas de recomendación (vacío = no recomendado). */
  recommendTags: string[];
  /** Pares libres clave-valor. */
  metadata: Record<string, string>;
  favoriteRank: number;
}

function defaultRow(): Pick<MasterRow, 'enabled' | 'recommendTags' | 'metadata' | 'favoriteRank'> {
  return { enabled: true, recommendTags: [], metadata: {}, favoriteRank: 0 };
}

/** Etiquetas base sugeridas cuando ninguna fila trae tags (se completa con las usadas). */
const BASE_TAGS = ['eficiente', 'barato', 'rápido', 'calidad'];

/** Filtro de estado de la tabla. */
type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * Maestro del catálogo (platform superadmin): decide qué modelos ve cada
 * tenant. Desactivar oculta el modelo en todos los listados y bloquea su
 * generación (el tenant no puede reactivarlo); recomendado marca los
 * eficientes con badge; el rank de favorito (> 0, admite varios) los sube al
 * frente del listado de su modalidad.
 */
@Component({
  selector: 'app-admin-model-master',
  imports: [
    FormsModule,
    TranslatePipe,
    Button,
    Checkbox,
    Dialog,
    InputNumber,
    InputText,
    Message,
    Select,
    TableModule,
    Tag,
    ToggleSwitch,
    Tooltip,
  ],
  templateUrl: './admin-model-master.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0' },
  styles: [
    `
      .status-chips {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 9999px;
        border: 1px solid var(--color-surface-border);
        background: var(--color-surface);
      }
      .status-chip {
        padding: 0.4rem 1rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-ink-muted-on-dark);
        transition:
          background-color 0.15s,
          color 0.15s;
      }
      .status-chip:hover {
        color: var(--color-ink-on-dark);
      }
      .status-chip.active {
        background: var(--color-surface-2);
        color: var(--color-ink-on-dark);
        box-shadow: inset 0 0 0 1px var(--color-surface-border);
      }
      .tags-cell {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
        padding: 0.25rem 0.5rem;
        border-radius: 0.75rem;
        border: 1px dashed transparent;
        text-align: left;
        transition:
          border-color 0.15s,
          background-color 0.15s;
      }
      .tags-cell:hover {
        border-color: var(--color-surface-border);
        background: var(--color-surface-2);
      }
      .tags-add {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-ink-muted-on-dark);
      }
      .tags-cell:hover .tags-add {
        color: var(--color-accent);
      }
    `,
  ],
})
export class AdminModelMasterComponent {
  private readonly adminService = inject(AdminService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly search = signal('');
  protected readonly modalityFilter = signal<Modality | 'all'>('all');
  protected readonly providerFilter = signal<string | 'all'>('all');
  protected readonly statusFilter = signal<StatusFilter>('all');

  /** Estado de trabajo por nombre de modelo (inicializado desde el back). */
  protected readonly rows = signal<Record<string, MasterRow>>({});
  protected readonly orphans = signal<readonly string[]>([]);

  protected readonly modalityOptions = computed(() => [
    { label: this.translate.instant('ADMIN.MODEL_MASTER.MODALITY_ALL'), value: 'all' as const },
    { label: 'Video', value: 'video' as const },
    { label: 'Imagen', value: 'image' as const },
    { label: 'Texto', value: 'text' as const },
    { label: 'Audio', value: 'audio' as const },
  ]);

  protected readonly providerOptions = computed(() => {
    const providers = new Set<string>();
    for (const row of Object.values(this.rows())) {
      const provider = row.model?.credential_provider;
      if (provider) {
        providers.add(provider);
      } else if (row.model?.type === 'downloaded') {
        providers.add('worker');
      }
    }
    return [
      { label: this.translate.instant('ADMIN.MODEL_MASTER.PROVIDER_ALL'), value: 'all' as const },
      ...[...providers]
        .sort((a, b) => a.localeCompare(b))
        .map((provider) => ({ label: provider, value: provider as string })),
    ];
  });

  protected readonly statusOptions = computed(() => [
    { label: this.translate.instant('ADMIN.MODEL_MASTER.STATUS_ALL'), value: 'all' as const },
    { label: this.translate.instant('ADMIN.MODEL_MASTER.STATUS_ACTIVE'), value: 'active' as const },
    { label: this.translate.instant('ADMIN.MODEL_MASTER.STATUS_INACTIVE'), value: 'inactive' as const },
  ]);

  /** Etiquetas predefinidas: unión de las usadas en todas las filas + base. */
  protected readonly predefinedTags = computed<string[]>(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    const add = (tag: string): void => {
      const key = tag.toLowerCase();
      if (tag !== '' && !seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    };
    for (const base of BASE_TAGS) {
      add(base);
    }
    for (const row of Object.values(this.rows())) {
      for (const tag of row.recommendTags) {
        add(tag.trim());
      }
    }
    return tags;
  });

  protected readonly filteredRows = computed<MasterRow[]>(() => {
    const query = this.search().trim().toLowerCase();
    const modality = this.modalityFilter();
    const provider = this.providerFilter();
    const status = this.statusFilter();
    return Object.values(this.rows()).filter((row) => {
      if (modality !== 'all' && row.model?.modality !== modality) {
        return false;
      }
      if (provider !== 'all' && this.rowProvider(row) !== provider) {
        return false;
      }
      if (status === 'active' && !row.enabled) {
        return false;
      }
      if (status === 'inactive' && row.enabled) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${row.model?.display_name ?? ''} ${row.name}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  /** Proveedor efectivo de la fila ('worker' para descargados, '' si se ignora). */
  private rowProvider(row: MasterRow): string {
    if (row.model?.credential_provider) {
      return row.model.credential_provider;
    }
    if (row.model?.type === 'downloaded') {
      return 'worker';
    }
    return '';
  }

  /** trackBy estable: evita que la tabla recree las filas (y robe el foco)
   *  en cada edición inline (rank, toggles). */
  protected trackByName(_index: number, row: MasterRow): string {
    return row.name;
  }

  protected readonly favoritesCount = computed(
    () => Object.values(this.rows()).filter((row) => row.favoriteRank > 0).length,
  );

  protected readonly disabledCount = computed(
    () => Object.values(this.rows()).filter((row) => !row.enabled).length,
  );

  protected readonly dirty = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService
      .getMasterModelPrefs()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODEL_MASTER.ERROR'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((view) => {
        const rows: Record<string, MasterRow> = {};
        for (const model of view.models) {
          const pref = view.prefs[model.name.toLowerCase()];
          rows[model.name] = {
            name: model.name,
            model,
            enabled: pref?.enabled ?? true,
            recommendTags: [...(pref?.recommend_tags ?? [])],
            metadata: { ...(pref?.metadata ?? {}) },
            favoriteRank: pref?.favorite_rank ?? 0,
          };
        }
        // Pref huérfana (modelo que ya no existe): fila sin catálogo para limpiarla.
        for (const name of view.orphans) {
          if (!rows[name]) {
            const pref = view.prefs[name.toLowerCase()];
            rows[name] = {
              name,
              model: null,
              enabled: pref?.enabled ?? true,
              recommendTags: [...(pref?.recommend_tags ?? [])],
              metadata: { ...(pref?.metadata ?? {}) },
              favoriteRank: pref?.favorite_rank ?? 0,
            };
          }
        }
        this.rows.set(rows);
        this.orphans.set(view.orphans);
        this.dirty.set(false);
      });
  }

  protected setEnabled(name: string, enabled: boolean): void {
    this.patch(name, { enabled });
  }

  /** Estado del proveedor: todo activo, todo apagado o mixto. */
  protected providerState(provider: string): 'on' | 'off' | 'mixed' {
    const list = Object.values(this.rows()).filter((row) => this.rowProvider(row) === provider);
    if (list.length === 0 || list.every((row) => row.enabled)) {
      return 'on';
    }
    if (list.every((row) => !row.enabled)) {
      return 'off';
    }
    return 'mixed';
  }

  /** Apaga (o reenciende) de una vez todos los modelos de un proveedor. */
  protected toggleProvider(provider: string): void {
    if (provider === 'all') {
      return;
    }
    const enable = this.providerState(provider) !== 'on';
    this.rows.update((rows) => {
      const next = { ...rows };
      for (const row of Object.values(next)) {
        if (this.rowProvider(row) === provider && row.enabled !== enable) {
          next[row.name] = { ...row, enabled: enable };
        }
      }
      return next;
    });
    this.dirty.set(true);
  }

  /** Orden automático: numera 1..N los visibles activos en el orden mostrado. */
  protected autoOrder(): void {
    const order = this.filteredRows();
    let rank = 0;
    this.rows.update((rows) => {
      const next = { ...rows };
      for (const row of order) {
        const favoriteRank = row.enabled ? ++rank : 0;
        if (next[row.name]?.favoriteRank !== favoriteRank) {
          next[row.name] = { ...next[row.name], favoriteRank };
        }
      }
      return next;
    });
    this.dirty.set(true);
  }

  /** Marca/desmarca una etiqueta predefinida (el diálogo no pierde el foco
   *  porque vive fuera de la tabla). */
  protected toggleRecommendTag(name: string, tag: string, checked: boolean): void {
    const rows = this.rows();
    const current = rows[name]?.recommendTags ?? [];
    const key = tag.toLowerCase();
    const recommendTags = checked
      ? [...current, ...(current.some((t) => t.toLowerCase() === key) ? [] : [tag])]
      : current.filter((t) => t.toLowerCase() !== key);
    this.patch(name, { recommendTags });
  }

  /** Etiqueta personalizada desde el diálogo (coma = varias). */
  protected addCustomTags(name: string, raw: string | null): string {
    const rows = this.rows();
    const current = rows[name]?.recommendTags ?? [];
    const seen = new Set(current.map((t) => t.toLowerCase()));
    const recommendTags = [...current];
    for (const part of (raw ?? '').split(',')) {
      const tag = part.trim();
      const key = tag.toLowerCase();
      if (tag === '' || seen.has(key)) {
        continue;
      }
      seen.add(key);
      recommendTags.push(tag);
    }
    this.patch(name, { recommendTags });
    // Devuelve vacío para limpiar el input del diálogo.
    return '';
  }

  protected metaEntries(row: MasterRow): [string, string][] {
    return Object.entries(row.metadata);
  }

  /** Fila abierta en el diálogo de etiquetas (null = cerrado). */
  protected readonly tagsDialogRow = signal<string | null>(null);
  /** Fila abierta en el diálogo de metadata (null = cerrado). */
  protected readonly metaDialogRow = signal<string | null>(null);

  /** La fila tiene la etiqueta (para el check del diálogo). */
  protected rowHasTag(name: string, tag: string): boolean {
    const key = tag.toLowerCase();
    return (this.rows()[name]?.recommendTags ?? []).some((t) => t.toLowerCase() === key);
  }

  protected onDialogVisible(visible: boolean): void {
    if (!visible) {
      this.closeDialogs();
    }
  }

  protected openTags(name: string): void {
    this.metaDialogRow.set(null);
    this.tagsDialogRow.set(name);
  }

  protected openMeta(name: string): void {
    this.tagsDialogRow.set(null);
    this.metaDialogRow.set(name);
  }

  protected closeDialogs(): void {
    this.tagsDialogRow.set(null);
    this.metaDialogRow.set(null);
  }

  protected addMeta(name: string, keyInput: HTMLInputElement, valueInput: HTMLInputElement): void {
    const key = keyInput.value.trim();
    if (key === '') {
      return;
    }
    const rows = this.rows();
    const current = rows[name];
    if (!current) {
      return;
    }
    this.patch(name, { metadata: { ...current.metadata, [key]: valueInput.value.trim() } });
    keyInput.value = '';
    valueInput.value = '';
  }

  protected removeMeta(name: string, key: string): void {
    const rows = this.rows();
    const current = rows[name];
    if (!current) {
      return;
    }
    const metadata = { ...current.metadata };
    delete metadata[key];
    this.patch(name, { metadata });
  }

  protected setRank(name: string, rank: number | null): void {
    const favoriteRank = Math.max(0, Math.min(99, Math.round(rank ?? 0)));
    this.patch(name, { favoriteRank });
  }

  protected removeRow(name: string): void {
    // Volver a defaults equivale a borrar la fila en el back.
    this.patch(name, { ...defaultRow() });
  }

  protected save(): void {
    const prefs: MasterModelPref[] = Object.values(this.rows())
      .filter(
        (row) =>
          !row.enabled ||
          row.recommendTags.length > 0 ||
          Object.keys(row.metadata).length > 0 ||
          row.favoriteRank > 0 ||
          row.model === null,
      )
      .map((row) => ({
        model_name: row.name,
        enabled: row.enabled,
        recommend_tags: [...row.recommendTags],
        metadata: { ...row.metadata },
        favorite_rank: row.favoriteRank,
      }));
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    this.adminService
      .upsertMasterModelPrefs(prefs)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODEL_MASTER.ERROR'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((view) => {
        this.saved.set(true);
        const rows: Record<string, MasterRow> = {};
        for (const name of Object.keys(this.rows())) {
          const model = view.models.find((m) => m.name === name) ?? null;
          const pref = view.prefs[name.toLowerCase()];
          rows[name] = {
            name,
            model,
            enabled: pref?.enabled ?? true,
            recommendTags: [...(pref?.recommend_tags ?? [])],
            metadata: { ...(pref?.metadata ?? {}) },
            favoriteRank: pref?.favorite_rank ?? 0,
          };
        }
        this.rows.set(rows);
        this.orphans.set(view.orphans);
        this.dirty.set(false);
        setTimeout(() => this.saved.set(false), 3000);
      });
  }

  private patch(
    name: string,
    update: Partial<Pick<MasterRow, 'enabled' | 'recommendTags' | 'metadata' | 'favoriteRank'>>,
  ): void {
    this.rows.update((rows) => {
      const current = rows[name] ?? { name, model: null, ...defaultRow() };
      return { ...rows, [name]: { ...current, ...update } };
    });
    this.dirty.set(true);
  }
}
