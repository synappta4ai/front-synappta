import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
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

  protected readonly filteredRows = computed<MasterRow[]>(() => {
    const query = this.search().trim().toLowerCase();
    const modality = this.modalityFilter();
    return Object.values(this.rows()).filter((row) => {
      if (modality !== 'all' && row.model?.modality !== modality) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${row.model?.display_name ?? ''} ${row.name}`.toLowerCase();
      return haystack.includes(query);
    });
  });

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

  /** Etiquetas separadas por coma (una o varias). */
  protected setRecommendTags(name: string, raw: string | null): void {
    const seen = new Set<string>();
    const recommendTags: string[] = [];
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
  }

  protected metaEntries(row: MasterRow): [string, string][] {
    return Object.entries(row.metadata);
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
