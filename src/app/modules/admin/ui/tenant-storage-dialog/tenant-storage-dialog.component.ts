import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { AdminService } from '../../services/admin.service';
import { Tenant, TenantStorageConfig } from '../../interfaces';

/** Mismo formato que valida el back (minúsculas, 3-63, puntos y guiones). */
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z0-9-]{1,64}$/;
const ENDPOINT_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Credenciales del bucket (S3/MinIO) de un tenant, para el superadmin de
 * plataforma. Guardar hace que el back verifique el bucket con un HEAD firmado:
 * si el endpoint o las credenciales no responden, no se persiste nada.
 */
@Component({
  selector: 'app-tenant-storage-dialog',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    TranslatePipe,
    Dialog,
    Button,
    InputText,
    Message,
    Tag,
    ToggleSwitch,
  ],
  templateUrl: './tenant-storage-dialog.component.html',
  styleUrls: ['./tenant-storage-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantStorageDialogComponent {
  private readonly adminService = inject(AdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly translate = inject(TranslateService);

  /** Tenant en gestión (null = diálogo cerrado). */
  readonly tenant = input<Tenant | null>(null);
  readonly closed = output<void>();

  protected readonly visible = computed(() => this.tenant() !== null);
  protected readonly config = signal<TenantStorageConfig | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly form = this.formBuilder.group({
    endpoint: ['', [Validators.required, Validators.pattern(ENDPOINT_PATTERN)]],
    bucket: ['', [Validators.required, Validators.pattern(BUCKET_PATTERN)]],
    region: ['us-east-1', [Validators.pattern(REGION_PATTERN)]],
    accessKeyId: [''],
    secretAccessKey: [''],
    publicBase: [''],
    enabled: [true],
  });

  protected readonly configured = computed(() => this.config()?.configured === true);

  /** Un tenant con bucket activo escribe ahí; cualquier otro caso va a disco. */
  protected readonly bucketActive = computed(() => {
    const cfg = this.config();
    return cfg !== null && cfg.configured && cfg.enabled;
  });

  /**
   * Sin configuración previa (o sin secret guardado) las credenciales son
   * obligatorias; al editar se pueden dejar vacías para conservar las actuales.
   */
  protected readonly needsCredentials = computed(() => {
    const cfg = this.config();
    return cfg === null || !cfg.configured || !cfg.has_secret;
  });

  protected onShow(): void {
    this.error.set('');
    this.notice.set('');
    this.confirmRemove.set(false);
    this.config.set(null);
    this.form.reset({
      endpoint: '',
      bucket: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      publicBase: '',
      enabled: true,
    });
    this.load();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected save(): void {
    const id = this.tenant()?.id ?? 0;
    if (!id || this.saving()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(this.translate.instant('ADMIN.STORAGE.ERRORS.VALIDATION'));
      return;
    }

    const raw = this.form.getRawValue();
    const accessKeyId = raw.accessKeyId.trim();
    const secretAccessKey = raw.secretAccessKey.trim();
    if (this.needsCredentials() && (!accessKeyId || !secretAccessKey)) {
      this.error.set(this.translate.instant('ADMIN.STORAGE.ERRORS.CREDENTIALS_REQUIRED'));
      return;
    }

    this.saving.set(true);
    this.adminService
      .saveTenantStorage(id, {
        endpoint: raw.endpoint.trim(),
        bucket: raw.bucket.trim(),
        region: raw.region.trim() || 'us-east-1',
        access_key_id: accessKeyId || undefined,
        secret_access_key: secretAccessKey || undefined,
        public_base: raw.publicBase.trim(),
        enabled: raw.enabled,
      })
      .pipe(
        catchError((err: unknown) => {
          this.error.set(this.errorMessage(err, 'ADMIN.STORAGE.ERRORS.SAVE'));
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe((cfg) => {
        this.config.set(cfg);
        this.form.patchValue({
          accessKeyId: '',
          secretAccessKey: '',
          enabled: cfg.enabled,
          region: cfg.region || 'us-east-1',
        });
        this.notice.set(this.translate.instant('ADMIN.STORAGE.SAVED'));
      });
  }

  protected askRemove(): void {
    this.error.set('');
    this.notice.set('');
    this.confirmRemove.set(true);
  }

  protected cancelRemove(): void {
    this.confirmRemove.set(false);
  }

  protected remove(): void {
    const id = this.tenant()?.id ?? 0;
    if (!id || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.error.set('');
    this.adminService
      .deleteTenantStorage(id)
      .pipe(
        catchError((err: unknown) => {
          this.error.set(this.errorMessage(err, 'ADMIN.STORAGE.ERRORS.REMOVE'));
          return EMPTY;
        }),
        finalize(() => {
          this.removing.set(false);
          this.confirmRemove.set(false);
        }),
      )
      .subscribe(() => {
        this.config.set({ configured: false, enabled: false, has_secret: false });
        this.form.patchValue({ enabled: true, accessKeyId: '', secretAccessKey: '' });
        this.notice.set(this.translate.instant('ADMIN.STORAGE.REMOVED'));
      });
  }

  private load(): void {
    const id = this.tenant()?.id ?? 0;
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.adminService
      .getTenantStorage(id)
      .pipe(
        catchError((err: unknown) => {
          this.error.set(this.errorMessage(err, 'ADMIN.STORAGE.ERRORS.LOAD'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((cfg) => {
        this.config.set(cfg);
        this.form.patchValue({
          endpoint: cfg.endpoint ?? '',
          bucket: cfg.bucket ?? '',
          region: cfg.region || 'us-east-1',
          publicBase: cfg.public_base ?? '',
          enabled: cfg.configured ? cfg.enabled : true,
          accessKeyId: '',
          secretAccessKey: '',
        });
      });
  }

  /** El back responde los errores del probe en `message`; se muestran tal cual. */
  private errorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string } | null;
      if (body?.message) {
        return body.message;
      }
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return this.translate.instant(fallbackKey);
  }
}
