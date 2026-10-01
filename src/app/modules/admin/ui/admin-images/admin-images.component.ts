import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize, forkJoin, lastValueFrom, mergeMap, of } from 'rxjs';
import { Observable } from 'rxjs';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { Dialog } from 'primeng/dialog';
import { Tooltip } from 'primeng/tooltip';
import { SelectButton } from 'primeng/selectbutton';
import { Select } from 'primeng/select';

import { UserSessionStore } from '@core/store/user.session';
import { AdminService } from '../../services/admin.service';
import { GeneratedImage } from '../../interfaces';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { LibraryService } from '@modules/library/services';
import { FileAsset, FileIngredientRef } from '@modules/library/interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project } from '@modules/events/interfaces';

type Section = 'generated' | 'uploads';
type IngFilter = 'all' | 'character' | 'location' | 'prop';

@Component({
  selector: 'app-admin-images',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    Button,
    InputText,
    InputIcon,
    IconField,
    Dialog,
    Tooltip,
    SelectButton,
    Select,
    ServerUrlPipe,
  ],
  templateUrl: './admin-images.component.html',
  styleUrl: './admin-images.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminImagesComponent {
  private readonly adminService = inject(AdminService);
  private readonly libraryService = inject(LibraryService);
  private readonly eventsService = inject(EventsService);
  private readonly sessionStore = inject(UserSessionStore);

  protected readonly isSuperadmin = computed(
    () => this.sessionStore.currentUser()?.role_level === 0,
  );

  /** Sección activa: imágenes generadas o recursos subidos. */
  protected readonly section = signal<Section>('generated');
  protected readonly sectionOptions = [
    { label: 'Generadas', value: 'generated', icon: 'md md-image' },
    { label: 'Recursos subidos', value: 'uploads', icon: 'md md-upload' },
  ];

  // ─── Generated ────────────────────────────────────────────────
  protected readonly images = signal<GeneratedImage[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly limit = 12;
  protected readonly search = signal('');

  // ─── Filtro por proyecto (centralización de recursos) ─────────
  protected readonly projects = signal<Project[]>([]);
  protected readonly projectOptions = computed(() =>
    this.projects().map((p) => ({ label: p.name, value: p.id })),
  );
  protected readonly filterProjectId = signal<string | null>(null);
  protected readonly filterProjectName = computed(
    () => this.projects().find((p) => p.id === this.filterProjectId())?.name ?? '',
  );

  /** Slug del tenant dueño de los recursos (visible para superadmin). */
  protected readonly tenantSlug = signal<string | null>(null);
  protected readonly ingTypeLabels: Record<string, string> = {
    character: 'Personaje',
    location: 'Locación',
    prop: 'Prop',
  };

  // ─── Tabs por tipo de ingrediente + subida múltiple ───────────
  protected readonly ingFilter = signal<IngFilter>('all');
  protected readonly ingFilterOptions: { value: IngFilter; label: string; icon: string }[] = [
    { value: 'all', label: 'Todos', icon: 'md md-grid_view' },
    { value: 'character', label: 'Personaje', icon: 'md md-person' },
    { value: 'location', label: 'Locación', icon: 'md md-place' },
    { value: 'prop', label: 'Prop', icon: 'md md-inventory_2' },
  ];
  protected readonly uploadButtons: {
    type: IngFilter;
    label: string;
    icon: string;
    hint: string;
    accept: string;
  }[] = [
    {
      type: 'all',
      label: 'Todos',
      icon: 'md md-upload',
      hint: 'Subir múltiples archivos (sin tipo)',
      accept: 'image/*,video/*,audio/*',
    },
    {
      type: 'character',
      label: 'Personaje',
      icon: 'md md-person',
      hint: 'Subir múltiples personajes (imágenes)',
      accept: 'image/*',
    },
    {
      type: 'location',
      label: 'Locación',
      icon: 'md md-place',
      hint: 'Subir múltiples locaciones (imágenes)',
      accept: 'image/*',
    },
    {
      type: 'prop',
      label: 'Prop',
      icon: 'md md-inventory_2',
      hint: 'Subir múltiples props (imágenes)',
      accept: 'image/*',
    },
  ];
  protected readonly uploadingType = signal<string | null>(null);
  protected readonly uploadProgress = signal<{ done: number; total: number } | null>(null);

  protected readonly ingCounts = computed(() => {
    const assets = this.assets();
    const count = (t: string) =>
      assets.filter((a) => (a.ingredients ?? []).some((i) => i.type === t)).length;
    return {
      all: assets.length,
      character: count('character'),
      location: count('location'),
      prop: count('prop'),
    } as Record<IngFilter, number>;
  });

  // ─── Editor de ingrediente (viewer) ────────────────────────────
  protected readonly ingTypeOptions = [
    { label: 'Personaje', value: 'character' },
    { label: 'Locación', value: 'location' },
    { label: 'Prop', value: 'prop' },
  ];
  protected readonly editIngId = signal<string | null>(null);
  protected readonly editIngType = signal<string>('character');
  protected readonly editIngName = signal('');
  protected readonly savingIng = signal(false);

  // ─── Selección y asignación de recursos subidos ───────────────
  protected readonly selectedAssetIds = signal<Set<string>>(new Set());
  protected readonly assignVisible = signal(false);
  protected readonly assignProjectId = signal<string | null>(null);
  protected readonly assigning = signal(false);

  protected readonly viewerVisible = signal(false);
  protected readonly selected = signal<GeneratedImage | FileAsset | null>(null);

  // ─── Uploaded assets (biblioteca) ─────────────────────────────
  protected readonly assets = signal<FileAsset[]>([]);
  protected readonly assetsTotal = signal(0);
  protected readonly assetsPage = signal(1);
  protected readonly assetsLimit = 24;

  protected readonly filteredAssets = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.ingFilter();
    return this.assets().filter((a) => {
      if (f !== 'all' && !(a.ingredients ?? []).some((i) => i.type === f)) {
        return false;
      }
      if (q && !a.filename.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  constructor() {
    this.loadProjects();
    this.loadSection();
  }

  private loadProjects(): void {
    this.eventsService
      .listEvents()
      .pipe(catchError(() => EMPTY))
      .subscribe((projects) => this.projects.set(projects));
  }

  /** Cambio del filtro de proyecto: recarga la sección activa. */
  protected onFilterProjectChange(value: string | null): void {
    this.filterProjectId.set(value);
    this.page.set(1);
    this.assetsPage.set(1);
    this.selectedAssetIds.set(new Set());
    this.loadSection();
  }

  protected toggleAssetSel(id: string): void {
    const next = new Set(this.selectedAssetIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedAssetIds.set(next);
  }

  protected clearSelection(): void {
    this.selectedAssetIds.set(new Set());
  }

  protected openAssign(): void {
    this.assignProjectId.set(null);
    this.assignVisible.set(true);
  }

  /** Asigna todos los recursos seleccionados al proyecto elegido. */
  protected confirmAssign(): void {
    const projectId = this.assignProjectId();
    const ids = [...this.selectedAssetIds()];
    if (!projectId || ids.length === 0) {
      return;
    }
    this.assigning.set(true);
    forkJoin(
      ids.map((id) =>
        this.libraryService.linkFileEvent(id, projectId).pipe(catchError(() => of(null))),
      ),
    )
      .pipe(finalize(() => this.assigning.set(false)))
      .subscribe(() => {
        this.assignVisible.set(false);
        this.clearSelection();
        this.loadUploads();
      });
  }

  /** Quita del proyecto filtrado todos los recursos seleccionados. */
  protected unassignFromProject(): void {
    const projectId = this.filterProjectId();
    const ids = [...this.selectedAssetIds()];
    if (!projectId || ids.length === 0) {
      return;
    }
    this.assigning.set(true);
    forkJoin(
      ids.map((id) =>
        this.libraryService.unlinkFileEvent(id, projectId).pipe(catchError(() => of(null))),
      ),
    )
      .pipe(finalize(() => this.assigning.set(false)))
      .subscribe(() => {
        this.clearSelection();
        this.loadUploads();
      });
  }

  protected onSectionChange(value: Section): void {
    this.section.set(value);
    this.error.set(null);
    this.search.set('');
    this.page.set(1);
    this.assetsPage.set(1);
    this.selectedAssetIds.set(new Set());
    this.loadSection();
  }

  private loadSection(): void {
    if (this.section() === 'generated') {
      this.loadGenerated();
    } else {
      this.loadUploads();
    }
  }

  // ─── Generated images ─────────────────────────────────────────
  // ─── Generated images ──────────────────────────────────────
  private loadGenerated(): void {
    this.loading.set(true);
    this.adminService
      .listGeneratedImages(this.page(), this.limit, this.filterProjectId() ?? undefined)
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar las imágenes generadas.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((pageData) => {
        this.images.set(pageData.logs ?? []);
        this.total.set(pageData.total);
      });
  }

  private loadUploads(): void {
    this.loading.set(true);
    this.libraryService
      .listFilesPaginated({
        page: this.assetsPage(),
        pageSize: this.assetsLimit,
        event_id: this.filterProjectId() ?? undefined,
      })
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los recursos subidos.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((pageData) => {
        this.assets.set([...(pageData.items ?? [])] as FileAsset[]);
        this.assetsTotal.set(pageData.total);
        this.tenantSlug.set(pageData.tenant_slug ?? null);
      });
  }

  protected filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.images();
    return this.images().filter(
      (v) =>
        v.task_id.toLowerCase().includes(q) ||
        (v.event_name ?? '').toLowerCase().includes(q) ||
        (v.piece_code ?? '').toLowerCase().includes(q),
    );
  });

  protected prevPage(): void {
    if (this.section() === 'generated' && this.page() > 1) {
      this.page.set(this.page() - 1);
      this.loadGenerated();
    } else if (this.section() === 'uploads' && this.assetsPage() > 1) {
      this.assetsPage.set(this.assetsPage() - 1);
      this.loadUploads();
    }
  }

  protected nextPage(): void {
    if (this.section() === 'generated' && this.page() * this.limit < this.total()) {
      this.page.set(this.page() + 1);
      this.loadGenerated();
    } else if (
      this.section() === 'uploads' &&
      this.assetsPage() * this.assetsLimit < this.assetsTotal()
    ) {
      this.assetsPage.set(this.assetsPage() + 1);
      this.loadUploads();
    }
  }

  protected hasPrev = computed(() =>
    this.section() === 'generated' ? this.page() > 1 : this.assetsPage() > 1,
  );
  protected hasNext = computed(() =>
    this.section() === 'generated'
      ? this.page() * this.limit < this.total()
      : this.assetsPage() * this.assetsLimit < this.assetsTotal(),
  );
  protected totalLabel = computed(() =>
    this.section() === 'generated' ? this.total() : this.assetsTotal(),
  );

  protected openViewer(asset: GeneratedImage | FileAsset): void {
    this.selected.set(asset);
    this.viewerVisible.set(true);
    if (!this.isGenerated(asset)) {
      const first = asset.ingredients?.[0];
      this.editIngId.set(first?.id ?? null);
      this.editIngType.set(first?.type ?? 'character');
      this.editIngName.set(first?.name ?? this.derivedName(asset.filename));
    }
  }

  /** Nombre por defecto para un recurso: filename sin extensión y con '_' → ' '. */
  protected derivedName(filename: string): string {
    return filename
      .replace(/\.[^.]+$/, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  protected startIngEdit(ing: FileIngredientRef): void {
    this.editIngId.set(ing.id);
    this.editIngType.set(ing.type);
    this.editIngName.set(ing.name);
  }

  /** Crea (y vincula) o renombra el ingrediente del recurso del viewer. */
  protected saveIngredient(): void {
    const s = this.selected();
    if (!s || this.isGenerated(s) || this.savingIng()) {
      return;
    }
    const file = s as FileAsset;
    const type = this.editIngType() as 'character' | 'location' | 'prop';
    const name = this.editIngName().trim() || this.derivedName(file.filename);
    this.savingIng.set(true);
    let created: { id: string } | null = null;
    const req$: Observable<unknown> = this.editIngId()
      ? this.libraryService.updateIngredient(this.editIngId()!, { type, name })
      : this.libraryService.createIngredient({ type, name }).pipe(
          mergeMap((ing) => {
            created = ing;
            return this.libraryService.addIngredientFile(ing.id, { file_id: file.id });
          }),
        );
    req$
      .pipe(
        catchError(() => {
          this.error.set('No se pudo guardar el ingrediente.');
          return EMPTY;
        }),
        finalize(() => this.savingIng.set(false)),
      )
      .subscribe(() => {
        const ingredients = this.editIngId()
          ? (file.ingredients ?? []).map((i) =>
              i.id === this.editIngId() ? { ...i, type, name } : i,
            )
          : [...(file.ingredients ?? []), { id: created?.id ?? '', type, name }];
        this.selected.set({ ...file, ingredients });
        this.editIngId.set(null);
        this.loadUploads();
      });
  }

  /** Subida múltiple: categoría por mime y, con tipo, crea el ingrediente auto. */
  protected onTypedUpload(event: Event, type: IngFilter): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0 || this.uploadingType()) {
      return;
    }
    this.uploadingType.set(type);
    this.uploadProgress.set({ done: 0, total: files.length });
    void this.uploadSequentially(files, type, input);
  }

  private async uploadSequentially(
    files: File[],
    type: IngFilter,
    input: HTMLInputElement,
  ): Promise<void> {
    let done = 0;
    for (const file of files) {
      const category = file.type.startsWith('video/')
        ? 'videos'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'images';
      try {
        const asset = await lastValueFrom(
          this.libraryService.uploadFile(file, category, this.filterProjectId() ?? undefined),
        );
        let ingredients: FileIngredientRef[] | undefined = asset.ingredients;
        if (type !== 'all') {
          const ing = await lastValueFrom(
            this.libraryService.createIngredient({ type, name: this.derivedName(file.name) }),
          );
          await lastValueFrom(this.libraryService.addIngredientFile(ing.id, { file_id: asset.id }));
          ingredients = [{ id: ing.id, type, name: ing.name }];
        }
        // Dedup: si el backend devolvió un archivo existente (mismo hash),
        // reemplaza su entrada en la lista en vez de agregar una copia visual.
        this.assets.update((list) => {
          const idx = list.findIndex((a) => a.id === asset.id);
          if (idx >= 0) {
            const next = [...list];
            next[idx] = {
              ...next[idx],
              ...asset,
              ingredients: ingredients ?? next[idx].ingredients,
            };
            return next;
          }
          return [{ ...asset, ingredients }, ...list];
        });
        if (!asset.duplicate) {
          this.assetsTotal.update((t) => t + 1);
        }
      } catch {
        this.error.set(`No se pudo subir "${file.name}".`);
      }
      done += 1;
      this.uploadProgress.set({ done, total: files.length });
    }
    this.uploadingType.set(null);
    this.uploadProgress.set(null);
    input.value = '';
  }

  protected closeViewer(): void {
    this.viewerVisible.set(false);
    this.selected.set(null);
  }

  /** URL de la miniatura de un asset de biblioteca. */
  protected assetThumb(asset: FileAsset): string {
    return asset.thumbnail_url || asset.url || '';
  }

  /** Etiqueta legible del tipo de ingrediente. */
  protected ingTypeLabel(type: string): string {
    return this.ingTypeLabels[type] ?? type;
  }

  /** Severity PrimeNG para el tag del tipo de ingrediente. */
  protected ingTypeSeverity(type: string): 'info' | 'success' | 'warn' {
    switch (type) {
      case 'character':
        return 'info';
      case 'location':
        return 'success';
      case 'prop':
        return 'warn';
      default:
        return 'info';
    }
  }

  /** Primera salida de imagen de una generación. */
  protected outputUrl(item: GeneratedImage): string {
    const out = item.outputs?.find((o) => o.type === 'image') ?? item.outputs?.[0];
    return out?.localUrl || out?.url || '';
  }

  /** Nombre mostrable según el tipo de asset seleccionado. */
  protected selectedName(): string {
    const s = this.selected();
    if (!s) return '';
    if ('filename' in s) return s.filename;
    return s.event_name || s.task_id;
  }

  protected isGenerated(s: GeneratedImage | FileAsset | null): s is GeneratedImage {
    return !!s && 'task_id' in s;
  }

  /** Soft-delete de un recurso subido. */
  protected deleteAsset(asset: FileAsset): void {
    this.libraryService
      .deleteFile(asset.id)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo eliminar el recurso.');
          return EMPTY;
        }),
      )
      .subscribe(() => this.loadUploads());
  }
}
