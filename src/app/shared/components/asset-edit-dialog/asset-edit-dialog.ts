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
import { catchError, EMPTY, finalize, lastValueFrom } from 'rxjs';

import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';

import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { EventsService } from '@modules/events/services';
import {
  CreateIngredientRequest,
  deriveElementName,
  deriveElementSlug,
  ElementMetadata,
  FileAsset,
  FileIngredientRef,
  IngredientFile,
  IngredientType,
  parseElementMetadata,
} from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { ImgFadeDirective } from '@shared/components/img-fade/img-fade.directive';
import { downloadRemoteFile } from '@utils/download-url';

/** Fila de "propiedades personalizadas" del diálogo Editar elemento. */
interface PropRow {
  key: string;
  value: string;
}

/** Valor sentinela del select Estado (el back guarda '' = sin estado). */
const STATUS_NONE = 'sin_estado';

/**
 * Modal "Editar elemento" (imágenes a la izquierda, datos a la derecha),
 * extraída de Recursos para poder abrirla desde cualquier flujo (p. ej.
 * Agencia) sin duplicar la lógica.
 *
 * Uso:
 * ```html
 * <app-asset-edit-dialog
 *   [visible]="visible()"
 *   [asset]="asset()"
 *   (closed)="close()"
 *   (changed)="load()"
 *   (assetSaved)="mergeAsset($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-asset-edit-dialog',
  imports: [
    FormsModule,
    Button,
    ConfirmDialog,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Textarea,
    ImgFadeDirective,
  ],
  providers: [ConfirmationService, ServerUrlPipe],
  templateUrl: './asset-edit-dialog.html',
  styleUrl: './asset-edit-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetEditDialogComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly eventsService = inject(EventsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly serverUrl = inject(ServerUrlPipe);

  /** Visibilidad controlada por el padre. */
  readonly visible = input(false);
  /** Asset a editar: al cambiar (y al abrir) se precarga su ingrediente. */
  readonly asset = input<FileAsset | null>(null);
  /** El usuario cerró la modal: el padre debe bajar su visible. */
  readonly closed = output<void>();
  /** Hubsieron cambios de fondo (asignar/quitar/eliminar/subir): la grilla
   *  del padre debe recargar. */
  readonly changed = output<void>();
  /** El elemento quedó guardado con sus ingredientes actualizados: el padre
   *  lo refleja en su lista para que el chip de la card se vea al instante. */
  readonly assetSaved = output<FileAsset>();

  protected readonly selected = signal<FileAsset | null>(null);
  protected readonly error = signal<string | null>(null);

  // ── Estado del diálogo "Editar elemento" ────────────────────────────────
  /** Ingrediente (elemento) vinculado; null = se crea al guardar. */
  protected readonly editIngId = signal<string | null>(null);
  protected readonly editType = signal<IngredientType>('character');
  protected readonly editName = signal('');
  /** Slug del ID sin '@' (el prefijo se muestra en el campo). */
  protected readonly editElementId = signal('');
  protected readonly editVersion = signal('');
  protected readonly editDescription = signal('');
  /** Valor del select Estado (STATUS_NONE = sin estado). */
  protected readonly editStatus = signal(STATUS_NONE);
  protected readonly editProps = signal<PropRow[]>([]);

  protected readonly savingElement = signal(false);
  protected readonly pickingImage = signal(false);
  protected readonly loadingElement = signal(false);
  /** Archivos vinculados al elemento (grilla izquierda). */
  protected readonly elementFiles = signal<IngredientFile[]>([]);
  /** true cuando elementFiles refleja el back (evita vínculos duplicados). */
  protected readonly filesLoaded = signal(false);
  protected readonly activeIdx = signal(0);
  /** Rotación visual de la vista previa (90° por click). */
  protected readonly rotation = signal(0);
  /** Último asset inicializado: evita re-inicializar al reabrir igual. */
  private readonly lastInit = signal<FileAsset | null>(null);

  protected readonly categoryOptions: { value: IngredientType; label: string; icon: string }[] = [
    { value: 'character', label: 'Personaje', icon: 'md md-person' },
    { value: 'location', label: 'Ubicación', icon: 'md md-place' },
    { value: 'prop', label: 'Utilería / Props', icon: 'md md-inventory_2' },
  ];

  protected readonly statusOptions: { value: string; label: string }[] = [
    { value: STATUS_NONE, label: 'Sin estado' },
    { value: 'borrador', label: 'Borrador' },
    { value: 'en_revision', label: 'En revisión' },
    { value: 'aprobado', label: 'Aprobado' },
    { value: 'descartado', label: 'Descartado' },
  ];

  /** Imágenes a mostrar: las del elemento o, si aún no existe, el recurso. */
  protected readonly displayFiles = computed<IngredientFile[]>(() => {
    const files = this.elementFiles();
    if (files.length > 0) {
      return files;
    }
    const file = this.selected();
    return file ? [this.toIngredientFile(file)] : [];
  });

  protected readonly activeFile = computed<IngredientFile | null>(() => {
    const list = this.displayFiles();
    if (list.length === 0) {
      return null;
    }
    return list[Math.min(this.activeIdx(), list.length - 1)] ?? list[0] ?? null;
  });

  protected readonly linkedFileIds = computed<ReadonlySet<string>>(
    () => new Set(this.elementFiles().map((file) => file.file_id)),
  );

  /** Título del elemento en el header del diálogo (@id o filename). */
  protected readonly elementLabel = computed(() => {
    const slug = this.editElementId().trim().replace(/^@/, '');
    if (slug) {
      return `@${slug}`;
    }
    return this.selected()?.filename ?? '';
  });

  protected readonly assignVisible = signal(false);
  protected readonly assignProjectId = signal<string | null>(null);
  protected readonly assigning = signal(false);
  protected readonly projectOptions = signal<{ label: string; value: string }[]>([]);

  /** Miniaturas que fallaron (archivo ausente/500 en el servidor). */
  protected readonly brokenThumbs = signal<ReadonlySet<string>>(new Set());

  protected markThumbBroken(id: string): void {
    if (this.brokenThumbs().has(id)) {
      return;
    }
    const next = new Set(this.brokenThumbs());
    next.add(id);
    this.brokenThumbs.set(next);
  }

  constructor() {
    this.loadProjects();
    // (Re)inicializa el editor cada vez que cambia el asset con la modal abierta.
    effect(() => {
      const file = this.asset();
      const isVisible = this.visible();
      if (!isVisible || !file || file === this.lastInit()) {
        return;
      }
      this.lastInit.set(file);
      this.initFor(file);
    });
  }

  /** Precarga el editor con el recurso elegido (aba el diálogo). */
  private initFor(file: FileAsset): void {
    const first = file.ingredients?.[0] ?? null;
    const derivedName = first?.name ?? deriveElementName(file.filename);

    this.selected.set(file);
    this.editIngId.set(first?.id ?? null);
    this.editType.set(
      this.toIngredientType(first?.type) ?? this.toIngredientType(file.category) ?? 'character',
    );
    this.editName.set(derivedName);
    this.editElementId.set(deriveElementSlug(derivedName));
    this.editVersion.set('');
    this.editDescription.set('');
    this.editStatus.set(STATUS_NONE);
    this.editProps.set([]);
    this.elementFiles.set([]);
    this.filesLoaded.set(!first?.id);
    this.activeIdx.set(0);
    this.rotation.set(0);
    this.error.set(null);

    if (first?.id) {
      void this.loadElement(first.id);
    }
  }

  protected onVisibleChange(visible: boolean): void {
    if (visible) {
      // Sólo el padre decide abrir (visible es input).
      return;
    }
    this.closeViewer();
  }

  protected closeViewer(): void {
    this.lastInit.set(null);
    this.selected.set(null);
    this.editIngId.set(null);
    this.elementFiles.set([]);
    this.filesLoaded.set(false);
    this.activeIdx.set(0);
    this.rotation.set(0);
    this.error.set(null);
    this.closed.emit();
  }

  /** Carga ingrediente + archivos (llamado al abrir y tras guardar). */
  private async loadElement(id: string): Promise<void> {
    this.loadingElement.set(true);
    try {
      const res = await lastValueFrom(this.libraryService.getIngredient(id));
      const ing = res ? res.ingredient : null;
      if (ing) {
        this.editIngId.set(ing.id);
        this.editType.set(ing.type);
        this.editName.set(ing.name);
        this.editDescription.set(ing.description ?? '');
        const meta = parseElementMetadata(ing.metadata);
        this.editElementId.set(
          (meta.element_id ?? '').replace(/^@/, '') || deriveElementSlug(ing.name),
        );
        this.editVersion.set(meta.version ?? '');
        this.editStatus.set(meta.status?.trim() ? meta.status : STATUS_NONE);
        this.editProps.set(
          Object.entries(meta.props ?? {}).map(([key, value]) => ({
            key,
            value: String(value ?? ''),
          })),
        );
      }
      this.elementFiles.set([...(res?.files ?? [])]);
      this.filesLoaded.set(true);
      this.clampActive();
    } catch {
      this.error.set('No se pudo cargar el elemento.');
    } finally {
      this.loadingElement.set(false);
    }
  }

  /** Recarga sólo los archivos vinculados (no pisa lo que el usuario escribió). */
  private async loadElementFiles(id: string): Promise<void> {
    this.loadingElement.set(true);
    try {
      const files = await lastValueFrom(this.libraryService.listIngredientFiles(id));
      this.elementFiles.set([...(files ?? [])]);
      this.filesLoaded.set(true);
      this.clampActive();
    } catch {
      this.error.set('No se pudieron cargar las imágenes del elemento.');
    } finally {
      this.loadingElement.set(false);
    }
  }

  private clampActive(): void {
    const list = this.elementFiles();
    if (this.activeIdx() >= list.length) {
      this.activeIdx.set(Math.max(0, list.length - 1));
    }
  }

  /** Recarga la grilla de imágenes del elemento (botón refrescar). */
  protected reloadFiles(): void {
    const id = this.editIngId();
    if (id) {
      void this.loadElementFiles(id);
    }
  }

  protected setActive(index: number): void {
    this.activeIdx.set(index);
    this.rotation.set(0);
  }

  protected rotatePreview(): void {
    this.rotation.update((deg) => (deg + 90) % 360);
  }

  /** Regenera el ID del elemento a partir del Nombre (botón ↺). */
  protected resetElementId(): void {
    this.editElementId.set(deriveElementSlug(this.editName()));
  }

  // ── Propiedades personalizadas ─────────────────────────────────────────

  protected addProp(): void {
    this.editProps.update((rows) => [...rows, { key: '', value: '' }]);
  }

  protected removeProp(index: number): void {
    this.editProps.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected updatePropKey(index: number, key: string): void {
    this.editProps.update((rows) => rows.map((row, i) => (i === index ? { ...row, key } : row)));
  }

  protected updatePropValue(index: number, value: string): void {
    this.editProps.update((rows) => rows.map((row, i) => (i === index ? { ...row, value } : row)));
  }

  // ── Imágenes del elemento ──────────────────────────────────────────────

  /** Sube una imagen, la vincula al elemento y refresca la grilla izquierda. */
  protected async onPickImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked || this.pickingImage()) {
      return;
    }
    this.pickingImage.set(true);
    try {
      const asset = await lastValueFrom(this.libraryService.uploadFile(picked, 'images'));
      const id = await this.ensureIngredientId();
      if (!id || !asset?.id) {
        throw new Error('missing ingredient');
      }
      if (!this.linkedFileIds().has(asset.id)) {
        await lastValueFrom(this.libraryService.addIngredientFile(id, { file_id: asset.id }));
      }
      await this.loadElementFiles(id);
      this.changed.emit();
    } catch {
      this.error.set('No se pudo añadir la imagen al elemento.');
    } finally {
      this.pickingImage.set(false);
    }
  }

  /** Quita la imagen activa del elemento (el archivo queda en la biblioteca). */
  protected confirmRemoveFile(): void {
    const ingId = this.editIngId();
    const active = this.activeFile();
    if (!ingId || !active) {
      return;
    }
    const filename = active.filename ?? 'esta imagen';
    this.confirmationService.confirm({
      message: `¿Quitar <strong>${filename}</strong> del elemento? El archivo sigue en la biblioteca.`,
      header: 'Quitar imagen',
      icon: 'md md-warning',
      acceptButtonProps: { label: 'Quitar', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary' },
      accept: () => {
        this.libraryService
          .removeIngredientFile(ingId, active.file_id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo quitar la imagen del elemento.');
              return EMPTY;
            }),
          )
          .subscribe(() => {
            void this.loadElementFiles(ingId);
            this.changed.emit();
          });
      },
    });
  }

  // ── Guardado ───────────────────────────────────────────────────────────

  /** Crea o actualiza el elemento y lo vincula al recurso actual. */
  protected async saveElement(): Promise<void> {
    const file = this.selected();
    if (!file || this.savingElement()) {
      return;
    }
    const payload = this.buildPayload(file);
    this.savingElement.set(true);
    try {
      let id = this.editIngId();
      if (id) {
        await lastValueFrom(this.libraryService.updateIngredient(id, payload));
      } else {
        const created = await lastValueFrom(this.libraryService.createIngredient(payload));
        id = created?.id ?? null;
        this.editIngId.set(id);
        this.filesLoaded.set(true);
      }
      if (id) {
        if (!this.filesLoaded()) {
          await this.loadElementFiles(id);
        }
        if (!this.linkedFileIds().has(file.id)) {
          await lastValueFrom(this.libraryService.addIngredientFile(id, { file_id: file.id }));
          await this.loadElementFiles(id);
        }
        // /files/page no siempre trae `ingredients`: reflejamos el guardado en
        // la card para que el chip y una reapertura del diálogo lo vean.
        const saved: FileIngredientRef = {
          id,
          type: payload.type ?? 'character',
          name: payload.name ?? deriveElementName(file.filename),
        };
        const ingredients = [
          saved,
          ...(file.ingredients ?? []).filter((ref) => ref.id !== saved.id),
        ];
        this.selected.update((item) =>
          item && item.id === file.id ? { ...item, ingredients } : item,
        );
        const merged = this.selected();
        if (merged) {
          this.assetSaved.emit(merged);
        }
      }
    } catch {
      this.error.set('No se pudo guardar el elemento.');
    } finally {
      this.savingElement.set(false);
    }
  }

  private buildPayload(file: FileAsset): CreateIngredientRequest {
    const name = this.editName().trim() || deriveElementName(file.filename);
    const props: Record<string, string> = {};
    for (const row of this.editProps()) {
      const key = row.key.trim();
      if (key) {
        props[key] = row.value;
      }
    }
    const slug = this.editElementId().trim().replace(/^@/, '');
    const metadata: ElementMetadata = {
      element_id: slug ? `@${slug}` : '',
      version: this.editVersion().trim(),
      status: this.editStatus() === STATUS_NONE ? '' : this.editStatus(),
      props,
    };
    return {
      type: this.editType(),
      name,
      description: this.editDescription().trim(),
      metadata: JSON.stringify(metadata),
    };
  }

  /** Crea el elemento sobre la marcha si se intenta añadir imágenes sin guardar. */
  private async ensureIngredientId(): Promise<string | null> {
    const existing = this.editIngId();
    if (existing) {
      return existing;
    }
    const file = this.selected();
    if (!file) {
      return null;
    }
    const created = await lastValueFrom(
      this.libraryService.createIngredient(this.buildPayload(file)),
    );
    const id = created?.id ?? null;
    this.editIngId.set(id);
    this.filesLoaded.set(true);
    return id;
  }

  /** Recurso como archivo del elemento (preview mientras no existe ingrediente). */
  private toIngredientFile(file: FileAsset): IngredientFile {
    return {
      file_id: file.id,
      role: null,
      filename: file.filename,
      url: file.url,
      thumbnail_url: file.thumbnail_url,
      mime_type: file.mime_type,
      category: file.category,
      format: file.format,
      size: file.size,
      created_at: file.created_at,
    };
  }

  private toIngredientType(value: string | null | undefined): IngredientType | null {
    if (value === 'character' || value === 'location') {
      return value;
    }
    if (value === 'prop' || value === 'props') {
      return 'prop';
    }
    return null;
  }

  // ── Asignar a proyecto ─────────────────────────────────────────────────

  private loadProjects(): void {
    this.eventsService
      .listEvents()
      .pipe(catchError(() => EMPTY))
      .subscribe((events) => {
        this.projectOptions.set(
          events.map((event) => ({ label: event.name, value: event.id })),
        );
      });
  }

  /** URL absoluta para handlers de usuario (evita pipes en statements). */
  protected absoluteUrl(url: string | null | undefined): string {
    return this.serverUrl.transform(url);
  }

  protected download(url: string | null | undefined, filename?: string | null): void {
    void downloadRemoteFile(url ?? '', filename ?? undefined);
  }

  protected openInTab(url: string | null | undefined): void {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  protected openAssign(): void {
    this.assignProjectId.set(null);
    this.assignVisible.set(true);
  }

  protected confirmAssign(): void {
    const file = this.selected();
    const projectId = this.assignProjectId();
    if (!file || !projectId) {
      return;
    }
    this.assigning.set(true);
    this.libraryService
      .linkFileEvent(file.id, projectId)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo asignar el recurso al proyecto.');
          return EMPTY;
        }),
        finalize(() => this.assigning.set(false)),
      )
      .subscribe(() => {
        this.assignVisible.set(false);
        this.changed.emit();
      });
  }

  protected confirmDelete(file: FileAsset): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el recurso <strong>${file.filename}</strong>? Se moverá a la papelera.`,
      header: 'Eliminar recurso',
      icon: 'md md-warning',
      acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary' },
      accept: () => {
        this.libraryService
          .deleteFile(file.id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo eliminar el recurso.');
              return EMPTY;
            }),
          )
          .subscribe(() => {
            this.closeViewer();
            this.changed.emit();
          });
      },
    });
  }
}
