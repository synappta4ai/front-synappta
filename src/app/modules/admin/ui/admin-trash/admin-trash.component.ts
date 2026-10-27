import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { AdminService } from '../../services/admin.service';
import { AdminTenantService } from '../../services/admin-tenant.service';
import { GeneratedMedia } from '../../interfaces';
import { LibraryService } from '@modules/library/services';
import { FileAsset } from '@modules/library/interfaces';
import { ServerUrlPipe } from '@pipes/server-url.pipe';

type TrashTab = 'videos' | 'images' | 'files';

const RETENTION_DAYS = 30;

/**
 * Papelera: generaciones y recursos borrados hace menos de 30 días.
 * Se pueden recuperar o borrar para siempre; a los 30 días el back los
 * elimina solo (purga nocturna).
 */
@Component({
  selector: 'app-admin-trash',
  imports: [DatePipe, Button, Message, Tag, Tooltip, TranslatePipe, ServerUrlPipe],
  templateUrl: './admin-trash.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTrashComponent {
  private readonly adminService = inject(AdminService);
  private readonly libraryService = inject(LibraryService);
  private readonly adminTenants = inject(AdminTenantService);
  private readonly translate = inject(TranslateService);

  protected readonly tenantSlug = computed(() => this.adminTenants.selectedTenant()?.slug ?? null);

  protected readonly tab = signal<TrashTab>('videos');
  protected readonly tabs: { value: TrashTab; labelKey: string; icon: string }[] = [
    { value: 'videos', labelKey: 'ADMIN.TRASH.TAB_VIDEOS', icon: 'md md-videocam' },
    { value: 'images', labelKey: 'ADMIN.TRASH.TAB_IMAGES', icon: 'md md-image' },
    { value: 'files', labelKey: 'ADMIN.TRASH.TAB_FILES', icon: 'md md-upload' },
  ];

  protected readonly videos = signal<GeneratedMedia[]>([]);
  protected readonly images = signal<GeneratedMedia[]>([]);
  protected readonly files = signal<FileAsset[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Id con borrado definitivo pendiente de confirmación. */
  protected readonly confirmId = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly rows = computed(() => {
    switch (this.tab()) {
      case 'videos':
        return this.videos();
      case 'images':
        return this.images();
      default:
        return [];
    }
  });

  constructor() {
    effect(() => {
      this.tenantSlug();
      untracked(() => this.reload());
    });
  }

  protected setTab(tab: TrashTab): void {
    this.tab.set(tab);
    this.confirmId.set(null);
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const slug = this.tenantSlug() ?? undefined;
    let pending = 3;
    const done = () => {
      pending -= 1;
      if (pending === 0) this.loading.set(false);
    };
    this.adminService.listTrashLogs(1, 100, 'video', slug).subscribe({
      next: (page) => {
        this.videos.set(page.logs ?? []);
        done();
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.LOAD'));
        done();
      },
    });
    this.adminService.listTrashLogs(1, 100, 'image', slug).subscribe({
      next: (page) => {
        this.images.set(page.logs ?? []);
        done();
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.LOAD'));
        done();
      },
    });
    this.libraryService.listTrashedFiles(slug).subscribe({
      next: (items) => {
        this.files.set(items ?? []);
        done();
      },
      error: () => {
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.LOAD'));
        done();
      },
    });
  }

  /** Fecha en que el item se borra solo (borrado + 30 días). */
  protected autoDeleteAt(deletedAt?: string | null): string {
    if (!deletedAt) return '';
    return new Date(new Date(deletedAt).getTime() + RETENTION_DAYS * 86400_000).toISOString();
  }

  protected thumbOf(item: GeneratedMedia | FileAsset): string {
    if ('outputs' in item) {
      const out = item.outputs?.find((o) => o.type === 'video' || o.type === 'image') ?? item.outputs?.[0];
      return out?.localUrl || out?.url || '';
    }
    return item.thumbnail_url || item.url || '';
  }

  protected nameOf(item: GeneratedMedia | FileAsset): string {
    if ('outputs' in item) {
      return item.event_name || item.piece_code || item.task_id;
    }
    return item.filename;
  }

  protected isVideo(item: GeneratedMedia | FileAsset): boolean {
    if ('outputs' in item) return (item.resource_type ?? '') === 'video';
    return (item.mime_type ?? '').startsWith('video/');
  }

  protected restoreMedia(item: GeneratedMedia): void {
    this.busyId.set(item.id);
    this.adminService.restoreGenerationLog(item.id, this.tenantSlug() ?? undefined).subscribe({
      next: () => {
        this.busyId.set(null);
        this.flash(this.translate.instant('ADMIN.TRASH.RESTORED'));
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.RESTORE'));
      },
    });
  }

  protected restoreFile(item: FileAsset): void {
    this.busyId.set(item.id);
    this.libraryService.restoreFile(item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.flash(this.translate.instant('ADMIN.TRASH.RESTORED'));
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.RESTORE'));
      },
    });
  }

  protected askDelete(id: string): void {
    this.confirmId.set(id);
  }

  protected cancelDelete(): void {
    this.confirmId.set(null);
  }

  protected confirmDeleteMedia(item: GeneratedMedia): void {
    this.confirmId.set(null);
    this.busyId.set(item.id);
    this.adminService.deleteGenerationLogPermanent(item.id, this.tenantSlug() ?? undefined).subscribe({
      next: () => {
        this.busyId.set(null);
        this.flash(this.translate.instant('ADMIN.TRASH.DELETED'));
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.DELETE'));
      },
    });
  }

  protected confirmDeleteFile(item: FileAsset): void {
    this.confirmId.set(null);
    this.busyId.set(item.id);
    this.libraryService.hardDeleteFile(item.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.flash(this.translate.instant('ADMIN.TRASH.DELETED'));
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(this.translate.instant('ADMIN.TRASH.ERRORS.DELETE'));
      },
    });
  }

  private flash(message: string): void {
    this.notice.set(message);
    setTimeout(() => this.notice.set(null), 3000);
  }
}
