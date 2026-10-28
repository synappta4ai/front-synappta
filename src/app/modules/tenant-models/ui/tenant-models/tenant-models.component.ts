import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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

import { AiModel, Modality, TenantModelPref } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';

interface TenantRow {
  name: string;
  model: AiModel | null;
  /** Recomendado por el maestro (solo lectura). */
  masterRecommended: boolean;
  /** Favorito del maestro (solo lectura; el propio rank manda en el orden). */
  masterFavorite: boolean;
  enabled: boolean;
  favoriteRank: number;
}

/**
 * "Mis modelos": el tenant ve lo que el maestro deja activo y ajusta lo
 * suyo. Desactivar oculta el modelo en sus pantallas; el rank de favorito
 * (> 0, admite varios) lo sube al frente de sus listados, por encima de los
 * favoritos del maestro. No puede reactivar lo que el maestro desactivó
 * (eso ni siquiera se lista).
 */
@Component({
  selector: 'app-tenant-models',
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
  ],
  templateUrl: './tenant-models.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantModelsComponent {
  private readonly agencyService = inject(AgencyService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly search = signal('');
  protected readonly modalityFilter = signal<Modality | 'all'>('all');
  protected readonly providerFilter = signal<string>('all');

  /** Paginado de la tabla principal (los filtros vuelven a la primera página). */
  protected readonly first = signal(0);
  protected readonly pageSize = signal(25);

  protected readonly rows = signal<Record<string, TenantRow>>({});
  /** Nombres con fila propia en el back (para saber qué mandar al guardar). */
  protected readonly ownNames = signal<ReadonlySet<string>>(new Set());

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
      }
    }
    return [
      { label: this.translate.instant('TENANT_MODELS.PROVIDER_ALL'), value: 'all' },
      ...Array.from(providers)
        .sort((a, b) => a.localeCompare(b))
        .map((provider) => ({ label: provider, value: provider })),
    ];
  });

  protected readonly visibleRows = computed<TenantRow[]>(() => {
    const query = this.search().trim().toLowerCase();
    const modality = this.modalityFilter();
    const provider = this.providerFilter();
    return Object.values(this.rows())
      .filter((row) => row.enabled)
      .filter((row) => modality === 'all' || row.model?.modality === modality)
      .filter(
        (row) => provider === 'all' || row.model?.credential_provider === provider,
      )
      .filter((row) => {
        if (!query) {
          return true;
        }
        const haystack = `${row.model?.display_name ?? ''} ${row.name}`.toLowerCase();
        return haystack.includes(query);
      });
  });

  protected readonly disabledRows = computed<TenantRow[]>(() =>
    Object.values(this.rows()).filter((row) => !row.enabled),
  );

  protected readonly dirty = signal(false);

  constructor() {
    // Cualquier cambio de filtro vuelve a la primera página del paginado.
    effect(() => {
      this.search();
      this.modalityFilter();
      this.providerFilter();
      this.first.set(0);
    });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.agencyService
      .getTenantModelPrefs()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('TENANT_MODELS.ERROR'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((view) => this.applyView(view.models, view.disabled, view.mine ?? {}));
  }

  protected setEnabled(name: string, enabled: boolean): void {
    this.patch(name, { enabled });
  }

  protected setRank(name: string, rank: number | null): void {
    const favoriteRank = Math.max(0, Math.min(99, Math.round(rank ?? 0)));
    this.patch(name, { favoriteRank });
  }

  protected save(): void {
    const own = this.ownNames();
    const prefs: TenantModelPref[] = Object.values(this.rows())
      .filter((row) => !row.enabled || row.favoriteRank > 0 || own.has(row.name))
      .map((row) => ({
        model_name: row.name,
        enabled: row.enabled,
        favorite_rank: row.favoriteRank,
      }));
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    this.agencyService
      .upsertTenantModelPrefs(prefs)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('TENANT_MODELS.ERROR'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((view) => {
        this.saved.set(true);
        this.applyView(view.models, view.disabled, view.mine ?? {});
        this.dirty.set(false);
        setTimeout(() => this.saved.set(false), 3000);
      });
  }

  private applyView(
    models: AiModel[],
    disabled: string[],
    mine: Record<string, TenantModelPref>,
  ): void {
    const rows: Record<string, TenantRow> = {};
    for (const model of models) {
      const own = mine[model.name.toLowerCase()];
      rows[model.name] = {
        name: model.name,
        model,
        masterRecommended: !!model.recommended,
        masterFavorite: !!model.favorite && !(own && own.favorite_rank > 0),
        enabled: true,
        favoriteRank: own?.favorite_rank ?? 0,
      };
    }
    for (const name of disabled) {
      const own = mine[name.toLowerCase()];
      rows[name] = {
        name,
        model: null,
        masterRecommended: false,
        masterFavorite: false,
        enabled: false,
        favoriteRank: own?.favorite_rank ?? 0,
      };
    }
    this.rows.set(rows);
    this.ownNames.set(new Set(Object.keys(mine)));
    this.dirty.set(false);
  }

  private patch(name: string, update: Partial<Pick<TenantRow, 'enabled' | 'favoriteRank'>>): void {
    this.rows.update((rows) => {
      const current = rows[name] ?? {
        name,
        model: null,
        masterRecommended: false,
        masterFavorite: false,
        enabled: true,
        favoriteRank: 0,
      };
      return { ...rows, [name]: { ...current, ...update } };
    });
    this.dirty.set(true);
  }
}
