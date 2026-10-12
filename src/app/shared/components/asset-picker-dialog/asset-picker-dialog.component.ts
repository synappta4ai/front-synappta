import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { catchError, EMPTY, finalize } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { SelectButton } from 'primeng/selectbutton';

import { LibraryService } from '@modules/library/services';
import {
  ASSET_SECTIONS,
  assetMatchesSection,
  FileAsset,
  FileListFilters,
} from '@modules/library/interfaces';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { TiltDirective } from '@shared/components/tilt/tilt.directive';
import { ImgFadeDirective } from '@shared/components/img-fade/img-fade.directive';

type PickerFilter = 'all' | 'character' | 'location' | 'props' | 'images' | 'videos';

/**
 * Modal de selección de recursos existentes de la biblioteca (los mismos
 * "Recursos subidos" de /admin/imagens). Emite los assets elegidos al cerrar
 * con "Usar seleccionados".
 */
@Component({
  selector: 'app-asset-picker-dialog',
  imports: [
    CommonModule,
    FormsModule,
    Button,
    Dialog,
    InputText,
    InputIcon,
    IconField,
    SelectButton,
    ServerUrlPipe,
    TiltDirective,
    ImgFadeDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visibleChange.emit($event)"
      [modal]="true"
      [style]="{ width: 'min(94vw, 64rem)' }"
      [draggable]="false"
      [resizable]="true"
      [closeOnEscape]="true"
      styleClass="asset-picker-dialog"
    >
      <ng-template #header>
        <div class="flex items-center gap-3">
          <div class="picker-head-icon"><i class="md md-photo_library"></i></div>
          <div>
            <h3 class="picker-title">{{ dialogTitle() }}</h3>
            <p class="picker-subtitle">{{ 'SHARED.ASSET_PICKER.SUBTITLE' | translate }}</p>
          </div>
        </div>
      </ng-template>

      <!-- Toolbar: filtro de tipo + búsqueda -->
      <div class="picker-toolbar">
        <p-selectbutton
          [ngModel]="filter()"
          (ngModelChange)="onFilterChange($event)"
          [options]="filterOptions"
          optionLabel="labelKey"
          optionValue="value"
          [allowEmpty]="false"
          styleClass="section-toggle"
        >
          <ng-template #item let-option>
            <span class="picker-tab-item">
              <i class="md {{ option.icon }}"></i>
              <span>{{ option.labelKey | translate }}</span>
              <span class="picker-tab-count">{{ pickerCounts()[option.value] }}</span>
            </span>
          </ng-template>
        </p-selectbutton>
        <span class="flex-1"></span>
        <p-iconfield iconPosition="left" styleClass="picker-search">
          <p-inputicon styleClass="md md-search" />
          <input
            pInputText
            type="text"
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="{{ 'LIBRARY.SEARCH_PLACEHOLDER' | translate }}"
          />
        </p-iconfield>
      </div>

      @if (loading()) {
        <div class="picker-empty">
          <i class="md md-autorenew md-spin text-2xl text-accent"></i>
          <p class="text-sm text-ink-muted-on-dark">{{ 'LIBRARY.LOADING' | translate }}</p>
        </div>
      } @else if (paged().length === 0) {
        <div class="picker-empty">
          <div class="picker-empty-icon"><i class="md md-inbox"></i></div>
          <h3>{{ 'LIBRARY.EMPTY_TITLE' | translate }}</h3>
          <p>{{ 'SHARED.ASSET_PICKER.EMPTY_HINT' | translate }}</p>
        </div>
      } @else {
        @for (group of groups(); track group.labelKey) {
          @if (group.labelKey) {
            <h4 class="picker-section-head">
              {{ group.labelKey | translate }}
              <span class="picker-section-count">{{ group.assets.length }}</span>
            </h4>
          }
          <div class="picker-grid">
            @for (asset of group.assets; track asset.id) {
              <button
                type="button"
                class="picker-card"
                appTilt
                [class.picked]="isSelected(asset.id)"
                (click)="toggle(asset.id)"
                [title]="asset.filename"
              >
                <div class="picker-thumb zoomable">
                  @if (asset.mime_type?.startsWith('image/')) {
                    <img
                      appImgFade
                      [src]="assetThumb(asset) | serverUrl"
                      [alt]="asset.filename"
                      loading="lazy"
                    />
                  } @else if (asset.mime_type?.startsWith('video/')) {
                    <video [src]="asset.url | serverUrl" preload="metadata"></video>
                  } @else {
                    <span class="flex h-full w-full items-center justify-center">
                      <i class="md md-description text-2xl text-ink-muted-on-dark"></i>
                    </span>
                  }
                  <span class="picker-check"><i class="md md-check"></i></span>
                  @if (asset.ingredients?.length) {
                    <span class="picker-ing">
                      <i class="md md-label"></i>
                      {{ asset.ingredients![0].name }}
                    </span>
                  }
                </div>
                <p class="picker-filename">{{ asset.filename }}</p>
              </button>
            }
          </div>
        }

        <!-- Paginación -->
        @if (total() > pageSize()) {
          <div class="picker-pagination">
            <span class="text-sm text-ink-muted-on-dark">
              {{ 'SHARED.ASSET_PICKER.PAGE' | translate: { page: page(), total: total() } }}
            </span>
            <div class="flex gap-2">
              <p-button
                icon="md md-chevron_left"
                size="small"
                [disabled]="page() <= 1"
                (onClick)="prevPage()"
              />
              <p-button
                icon="md md-chevron_right"
                size="small"
                [disabled]="page() * pageSize() >= total()"
                (onClick)="nextPage()"
              />
            </div>
          </div>
        }
      }

      <ng-template #footer>
        <div class="flex w-full items-center justify-between">
          <span class="text-sm text-ink-muted-on-dark">
            {{ 'SHARED.ASSET_PICKER.SELECTED' | translate: { count: selectedIds().size } }}
            @if (max() > 0) {
              <span class="text-ink-muted-on-dark">{{
                'SHARED.ASSET_PICKER.MAX' | translate: { max: max() }
              }}</span>
            }
          </span>
          <div class="flex gap-2">
            <p-button
              label="{{ 'SHARED.ASSET_PICKER.CANCEL' | translate }}"
              size="small"
              [text]="true"
              (onClick)="visibleChange.emit(false)"
            />
            <p-button
              label="{{ 'SHARED.ASSET_PICKER.USE_SELECTED' | translate }}"
              icon="md md-check"
              size="small"
              [disabled]="selectedIds().size === 0"
              (onClick)="confirm()"
            />
          </div>
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .picker-head-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-surface-border);
      color: var(--color-accent);
    }

    .picker-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--color-ink-on-dark);
    }

    .picker-subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--color-ink-muted-on-dark);
    }

    .picker-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    /* Contenido de cada tab del filtro (icono + label + contador). */
    .picker-tab-item {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .picker-tab-item .md {
      font-size: 13px;
    }

    .picker-tab-count {
      min-width: 20px;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      background: var(--st-panel-2, rgba(255, 255, 255, 0.12));
      border: 1px solid var(--st-line, rgba(255, 255, 255, 0.14));
    }

    .picker-search {
      width: 220px;
    }

    .picker-search input {
      width: 100%;
      font-size: 13.5px;
      padding-left: 2.4rem;
    }

    .picker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
      max-height: 56vh;
      overflow-y: auto;
      padding: 2px;
    }

    .picker-section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 2px 8px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-ink-muted);
    }

    .picker-section-head:first-child {
      margin-top: 2px;
    }

    .picker-section-count {
      font-size: 11px;
      font-weight: 700;
      padding: 0 7px;
      border-radius: 999px;
      border: 1px solid var(--st-line, rgba(255, 255, 255, 0.1));
      background: var(--st-panel-2, rgba(255, 255, 255, 0.06));
    }

    .picker-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      background: var(--color-surface-2);
      border: 2px solid var(--color-surface-border);
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
      transition:
        border-color 0.15s ease,
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }

    .picker-card:hover {
      transform: translateY(-2px);
      border-color: var(--color-surface-border-strong);
      box-shadow: 0 6px 16px color-mix(in srgb, var(--color-ink) 30%, transparent);
    }

    .picker-card.picked {
      border-color: var(--color-accent);
    }

    .picker-thumb {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 8px;
      background: var(--color-surface);
    }

    .picker-thumb img,
    .picker-thumb video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .picker-check {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 7px;
      background: color-mix(in srgb, var(--color-scrim) 55%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-ink-on-dark) 40%, transparent);
      color: transparent;
      font-size: 12px;
      transition: all 0.15s ease;
    }

    .picker-card.picked .picker-check {
      background: var(--color-accent);
      border-color: var(--color-ink);
      color: var(--color-on-accent);
    }

    .picker-ing {
      position: absolute;
      bottom: 6px;
      left: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: calc(100% - 12px);
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--color-scrim) 62%, transparent);
      backdrop-filter: blur(4px);
      color: var(--color-ink-on-dark);
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .picker-filename {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--color-ink-on-dark);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .picker-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 12px;
      padding: 8px 12px;
      border: 1px solid var(--color-surface-border);
      border-radius: 12px;
      background: var(--color-surface-2);
    }

    .picker-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 24px;
      text-align: center;
    }

    .picker-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 60px;
      height: 60px;
      border-radius: 999px;
      font-size: 24px;
      background: var(--color-surface-2);
      border: 1px solid var(--color-surface-border);
      color: var(--color-accent);
    }

    .picker-empty h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--color-ink-on-dark);
    }

    .picker-empty p {
      margin: 0;
      font-size: 13px;
      color: var(--color-ink-muted-on-dark);
    }
  `,
})
export class AssetPickerDialogComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly translate = inject(TranslateService);

  /** Visibilidad de la modal (two-way con la página contenedora). */
  readonly visible = input.required<boolean>();
  readonly visibleChange = output<boolean>();

  /** Assets confirmados con "Usar seleccionados". */
  readonly confirmed = output<FileAsset[]>();

  /** Título de la modal. */
  readonly title = input<string>('');
  /** Título mostrado: el provisto o el fallback i18n del picker. */
  protected readonly dialogTitle = computed(() => {
    this.translate.currentLang();
    return this.title() || this.translate.instant('SHARED.ASSET_PICKER.DEFAULT_TITLE');
  });
  /** Máximo seleccionable; 0 = sin límite. */
  readonly max = input<number>(0);
  /** Filtrar por proyecto (evento) o biblioteca completa. */
  readonly eventId = input<string | null>(null);

  readonly pageSize = input<number>(48);

  readonly loading = signal(false);
  readonly assets = signal<FileAsset[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly search = signal('');
  readonly filter = signal<PickerFilter>('all');
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly filterOptions = [
    { labelKey: 'LIBRARY.FILTER_ALL', value: 'all' as const, icon: 'md md-grid_view' },
    { labelKey: 'LIBRARY.FILTER_CHARACTER', value: 'character' as const, icon: 'md md-person' },
    { labelKey: 'LIBRARY.FILTER_LOCATION', value: 'location' as const, icon: 'md md-place' },
    { labelKey: 'LIBRARY.FILTER_PROPS', value: 'props' as const, icon: 'md md-inventory_2' },
    { labelKey: 'LIBRARY.FILTER_IMAGES', value: 'images' as const, icon: 'md md-image' },
    { labelKey: 'LIBRARY.FILTER_VIDEOS', value: 'videos' as const, icon: 'md md-videocam' },
  ];

  /** Contadores por filtro para los tabs (como la galería): secciones por
      category o ingrediente; imágenes/videos por mime. */
  readonly pickerCounts = computed<Record<string, number>>(() => {
    const list = this.assets();
    const count = (fn: (a: FileAsset) => boolean) => list.filter(fn).length;
    return {
      all: list.length,
      character: count((a) => assetMatchesSection(a, 'character')),
      location: count((a) => assetMatchesSection(a, 'location')),
      props: count((a) => assetMatchesSection(a, 'props')),
      images: count((a) => !!a.mime_type?.startsWith('image/')),
      videos: count((a) => !!a.mime_type?.startsWith('video/')),
    };
  });

  readonly paged = computed(() => {
    const term = this.search().trim().toLowerCase();
    const f = this.filter();
    // Imágenes/Videos filtran por contenido (mime), no por categoría: las
    // referencias con sección (character/location/props) son imágenes.
    const base =
      f === 'all'
        ? this.assets()
        : f === 'images'
          ? this.assets().filter((a) => a.mime_type?.startsWith('image/'))
          : f === 'videos'
            ? this.assets().filter((a) => a.mime_type?.startsWith('video/'))
            : this.assets().filter((a) => assetMatchesSection(a, f));
    if (!term) {
      return base;
    }
    return base.filter((a) => a.filename.toLowerCase().includes(term));
  });

  /**
   * Grid agrupado por sección de referencia (Personaje / Ubicación / Props /
   * Otros). Con búsqueda o filtro activo se muestra plano (un solo grupo).
   */
  readonly groups = computed<{ labelKey: string; assets: FileAsset[] }[]>(() => {
    const list = this.paged();
    if (this.filter() !== 'all' || this.search().trim()) {
      return [{ labelKey: '', assets: list }];
    }
    const groups = [
      ...ASSET_SECTIONS.map((s) => ({
        labelKey: `LIBRARY.FILTER_${s.key.toUpperCase()}`,
        assets: list.filter((a) => assetMatchesSection(a, s.key)),
      })),
      {
        labelKey: 'SHARED.ASSET_PICKER.OTHERS',
        assets: list.filter((a) => !ASSET_SECTIONS.some((s) => assetMatchesSection(a, s.key))),
      },
    ];
    return groups.filter((g) => g.assets.length > 0);
  });

  constructor() {
    // Carga inicial y recarga al abrir la modal.
    effect(() => {
      if (this.visible()) {
        this.load();
      }
    });
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected toggle(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      const max = this.max();
      if (max > 0 && next.size >= max) {
        return;
      }
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  protected confirm(): void {
    const ids = this.selectedIds();
    const chosen = this.assets().filter((a) => ids.has(a.id));
    this.confirmed.emit(chosen);
    this.visibleChange.emit(false);
  }

  protected assetThumb(asset: FileAsset): string {
    return asset.thumbnail_url || asset.url || '';
  }

  protected onFilterChange(value: PickerFilter): void {
    this.filter.set(value);
    this.page.set(1);
  }

  protected onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected prevPage(): void {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  protected nextPage(): void {
    if (this.page() * this.pageSize() < this.total()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }

  private load(): void {
    this.loading.set(true);
    const filters: FileListFilters = {
      page: this.page(),
      pageSize: this.pageSize(),
      event_id: this.eventId() ?? undefined,
    };
    this.libraryService
      .listFilesPaginated(filters)
      .pipe(
        catchError(() => EMPTY),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((pageData) => {
        this.assets.set([...(pageData.items ?? [])] as FileAsset[]);
        this.total.set(pageData.total ?? 0);
      });
  }
}
