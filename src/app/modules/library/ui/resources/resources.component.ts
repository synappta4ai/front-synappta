import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, EMPTY, finalize, lastValueFrom, Subject } from 'rxjs';

import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';

import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { formatBytesValue } from '@pipes/format-bytes.pipe';
import {
  AssetSectionKey,
  assetMatchesSection,
  FileAsset,
  FileListFilters,
} from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { AssetEditDialogComponent } from '@shared/components/asset-edit-dialog/asset-edit-dialog';
import { ImgFadeDirective } from '@shared/components/img-fade/img-fade.directive';
import { PageContainerComponent } from '@shared/components/page-container/page-container.component';
import { downloadRemoteFile } from '@utils/download-url';

/** Clasificación de la biblioteca: medios por MIME + secciones de assets. */
type ResFilter = 'all' | 'images' | 'videos' | 'audio' | AssetSectionKey | 'other';

interface ResOption {
  value: ResFilter;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-resources',
  imports: [
    FormsModule,
    PageContainerComponent,
    AssetEditDialogComponent,
    Button,
    IconField,
    InputIcon,
    InputText,
    Message,
    DatePipe,
    ServerUrlPipe,
    ImgFadeDirective,
    TranslatePipe,
  ],
  providers: [ServerUrlPipe],
  templateUrl: './resources.component.html',
  styleUrl: './resources.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourcesComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly serverUrl = inject(ServerUrlPipe);
  private readonly translate = inject(TranslateService);

  protected readonly pageSize = 48;

  protected readonly files = signal<FileAsset[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly total = signal(0);

  protected readonly searchInput = signal('');
  private readonly searchTerm = signal('');
  private readonly search$ = new Subject<string>();

  protected readonly filter = signal<ResFilter>('all');

  protected readonly filterOptions: ResOption[] = [
    { value: 'all', labelKey: 'LIBRARY.FILTER_ALL', icon: 'md md-grid_view' },
    { value: 'images', labelKey: 'LIBRARY.FILTER_IMAGES', icon: 'md md-image' },
    { value: 'videos', labelKey: 'LIBRARY.FILTER_VIDEOS', icon: 'md md-videocam' },
    { value: 'audio', labelKey: 'LIBRARY.FILTER_AUDIO', icon: 'md md-play_circle' },
    { value: 'character', labelKey: 'LIBRARY.FILTER_CHARACTER', icon: 'md md-person' },
    { value: 'location', labelKey: 'LIBRARY.FILTER_LOCATION', icon: 'md md-place' },
    { value: 'props', labelKey: 'LIBRARY.FILTER_PROPS', icon: 'md md-inventory_2' },
    { value: 'other', labelKey: 'LIBRARY.FILTER_OTHER', icon: 'md md-description' },
  ];

  // ── Modal "Editar elemento" (componente compartido) ─────────────────────
  protected readonly editorVisible = signal(false);
  protected readonly editorAsset = signal<FileAsset | null>(null);

  protected readonly uploading = signal(false);
  protected readonly uploadProgress = signal<{ done: number; total: number } | null>(null);

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
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.searchTerm.set(value);
      this.page.set(1);
      this.load();
    });

    this.load();
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filters: FileListFilters = {
      page: this.page(),
      pageSize: this.pageSize,
      q: this.searchTerm() || undefined,
    };
    this.libraryService
      .listFilesPaginated(filters)
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('LIBRARY.ERRORS.LOAD'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((res) => {
        this.files.set([...((res.items ?? []) as FileAsset[])]);
        this.total.set(res.total ?? 0);
      });
  }

  protected onSearchInput(value: string): void {
    this.searchInput.set(value);
    this.search$.next(value);
  }

  protected prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((value) => value - 1);
    this.load();
  }

  protected nextPage(): void {
    if (!this.hasNext()) return;
    this.page.update((value) => value + 1);
    this.load();
  }

  protected hasNext(): boolean {
    return this.page() * this.pageSize < this.total();
  }

  // ── Clasificación ────────────────────────────────────────────────────────

  private matchesFilter(file: FileAsset, key: ResFilter): boolean {
    switch (key) {
      case 'all':
        return true;
      case 'images':
        return !!file.mime_type?.startsWith('image/');
      case 'videos':
        return !!file.mime_type?.startsWith('video/');
      case 'audio':
        return !!file.mime_type?.startsWith('audio/');
      case 'other':
        return (
          !file.mime_type?.startsWith('image/') &&
          !file.mime_type?.startsWith('video/') &&
          !file.mime_type?.startsWith('audio/')
        );
      default:
        return assetMatchesSection(file, key);
    }
  }

  protected readonly counts = computed<Record<ResFilter, number>>(() => {
    const counts: Record<ResFilter, number> = {
      all: 0,
      images: 0,
      videos: 0,
      audio: 0,
      character: 0,
      location: 0,
      props: 0,
      other: 0,
    };
    for (const file of this.files()) {
      counts.all += 1;
      for (const key of [
        'images',
        'videos',
        'audio',
        'character',
        'location',
        'props',
        'other',
      ] as const) {
        if (this.matchesFilter(file, key)) {
          counts[key] += 1;
        }
      }
    }
    return counts;
  });

  protected readonly filteredFiles = computed(() => {
    const filter = this.filter();
    return filter === 'all'
      ? this.files()
      : this.files().filter((file) => this.matchesFilter(file, filter));
  });

  // ── Subida ───────────────────────────────────────────────────────────────

  protected onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0 || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.uploadProgress.set({ done: 0, total: files.length });
    void this.uploadSequentially(files, input);
  }

  private async uploadSequentially(files: File[], input: HTMLInputElement): Promise<void> {
    let done = 0;
    for (const file of files) {
      const category = file.type.startsWith('video/')
        ? 'videos'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'images';
      try {
        await lastValueFrom(this.libraryService.uploadFile(file, category));
      } catch {
        this.error.set(this.translate.instant('LIBRARY.ERRORS.UPLOAD', { name: file.name }));
      }
      done += 1;
      this.uploadProgress.set({ done, total: files.length });
    }
    this.uploading.set(false);
    this.uploadProgress.set(null);
    input.value = '';
    this.page.set(1);
    this.load();
  }

  /** Abre la modal "Editar elemento" del componente compartido. */
  protected openViewer(file: FileAsset): void {
    this.editorAsset.set(file);
    this.editorVisible.set(true);
  }

  /** Refleja un asset guardado en la grilla (chip de ingrediente al instante). */
  protected mergeAsset(saved: FileAsset): void {
    this.files.update((list) => list.map((item) => (item.id === saved.id ? saved : item)));
  }

  protected absoluteUrl(url: string | null | undefined): string {
    return this.serverUrl.transform(url);
  }

  protected download(url: string | null | undefined, filename?: string | null): void {
    void downloadRemoteFile(url ?? '', filename ?? undefined);
  }

  protected formatSize(size: number | null): string {
    return formatBytesValue(size);
  }

  protected ingTypeLabel(type: string | null): string {
    const key =
      type === 'character'
        ? 'LIBRARY.ING_CHARACTER'
        : type === 'location'
          ? 'LIBRARY.ING_LOCATION'
          : type === 'props' || type === 'prop'
            ? 'LIBRARY.ING_PROP'
            : null;
    return key
      ? this.translate.instant(key)
      : (type ?? this.translate.instant('LIBRARY.ING_RESOURCE'));
  }
}
