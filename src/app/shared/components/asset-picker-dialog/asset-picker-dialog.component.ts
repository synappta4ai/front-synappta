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

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { SelectButton } from 'primeng/selectbutton';

import { LibraryService } from '@modules/library/services';
import {
  ASSET_SECTIONS,
  FileAsset,
  FileListFilters,
  isAssetSection,
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
            <h3 class="picker-title">{{ title() }}</h3>
            <p class="picker-subtitle">Recursos de la biblioteca — mismos que Admin → Imágenes</p>
          </div>
        </div>
      </ng-template>

      <!-- Toolbar: filtro de tipo + búsqueda -->
      <div class="picker-toolbar">
        <p-selectbutton
          [ngModel]="filter()"
          (ngModelChange)="onFilterChange($event)"
          [options]="filterOptions"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false"
          styleClass="section-toggle"
        />
        <span class="flex-1"></span>
        <p-iconfield iconPosition="left" styleClass="picker-search">
          <p-inputicon styleClass="md md-search" />
          <input
            pInputText
            type="text"
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Buscar por nombre…"
          />
        </p-iconfield>
      </div>

      @if (loading()) {
        <div class="picker-empty">
          <i class="md md-autorenew md-spin text-2xl text-accent"></i>
          <p class="text-sm text-ink-muted-on-dark">Cargando recursos…</p>
        </div>
      } @else if (paged().length === 0) {
        <div class="picker-empty">
          <div class="picker-empty-icon"><i class="md md-inbox"></i></div>
          <h3>No hay recursos</h3>
          <p>Sube recursos desde Admin → Imágenes y aparecerán aquí.</p>
        </div>
      } @else {
        @for (group of groups(); track group.label) {
          @if (group.label) {
            <h4 class="picker-section-head">
              {{ group.label }}
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
              Página {{ page() }} — {{ total() }} recursos
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
            {{ selectedIds().size }} seleccionado(s)
            @if (max() > 0) {
              <span class="text-ink-muted-on-dark">(máx. {{ max() }})</span>
            }
          </span>
          <div class="flex gap-2">
            <p-button
              label="Cancelar"
              size="small"
              [text]="true"
              (onClick)="visibleChange.emit(false)"
            />
            <p-button
              label="Usar seleccionados"
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

  /** Visibilidad de la modal (two-way con la página contenedora). */
  readonly visible = input.required<boolean>();
  readonly visibleChange = output<boolean>();

  /** Assets confirmados con "Usar seleccionados". */
  readonly confirmed = output<FileAsset[]>();

  /** Título de la modal. */
  readonly title = input<string>('Elegir recursos de la biblioteca');
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
    { label: 'Todos', value: 'all' as const, icon: 'md md-grid_view' },
    { label: 'Personaje', value: 'character' as const, icon: 'md md-person' },
    { label: 'Ubicación', value: 'location' as const, icon: 'md md-place' },
    { label: 'Props', value: 'props' as const, icon: 'md md-inventory_2' },
    { label: 'Imágenes', value: 'images' as const, icon: 'md md-image' },
    { label: 'Videos', value: 'videos' as const, icon: 'md md-videocam' },
  ];

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
            : this.assets().filter((a) => a.category === f);
    if (!term) {
      return base;
    }
    return base.filter((a) => a.filename.toLowerCase().includes(term));
  });

  /**
   * Grid agrupado por sección de referencia (Personaje / Ubicación / Props /
   * Otros). Con búsqueda o filtro activo se muestra plano (un solo grupo).
   */
  readonly groups = computed<{ label: string; assets: FileAsset[] }[]>(() => {
    const list = this.paged();
    if (this.filter() !== 'all' || this.search().trim()) {
      return [{ label: '', assets: list }];
    }
    const groups = [
      ...ASSET_SECTIONS.map((s) => ({
        label: s.label,
        assets: list.filter((a) => a.category === s.key),
      })),
      { label: 'Otros recursos', assets: list.filter((a) => !isAssetSection(a.category)) },
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
