import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, forkJoin, switchMap, tap } from 'rxjs';
import { HttpResponse } from '@angular/common/http';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Select } from 'primeng/select';
import { Password } from 'primeng/password';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tooltip } from 'primeng/tooltip';

import { AdminService } from '../../services/admin.service';
import { AdminTenantService } from '../../services/admin-tenant.service';
import {
  CredentialProviderType,
  TenantCredential,
  TenantModel,
  UpsertTenantCredentialRequest,
  WorkerModel,
  WorkerModelState,
} from '../../interfaces';

interface ProviderOption {
  label: string;
  value: CredentialProviderType;
  icon: string;
}

@Component({
  selector: 'app-admin-models',
  imports: [
    ReactiveFormsModule,
    Button,
    InputText,
    TableModule,
    Tag,
    Message,
    ConfirmDialog,
    Select,
    Password,
    ProgressSpinner,
    Tooltip,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-models.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModelsComponent {
  private readonly adminService = inject(AdminService);
  private readonly adminTenants = inject(AdminTenantService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  // El tenant se elige una sola vez, en el header de la consola.
  protected readonly selectedTenantId = this.adminTenants.selectedTenantId;
  protected readonly selectedTenant = this.adminTenants.selectedTenant;

  protected readonly models = signal<TenantModel[]>([]);
  protected readonly credentials = signal<TenantCredential[]>([]);
  protected readonly loadingConfig = signal(false);
  protected readonly savingCredential = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly savedMessage = signal<string | null>(null);

  // ─── Worker models ────────────────────────────────────────────────
  protected readonly workerModels = signal<WorkerModel[]>([]);
  protected readonly loadingWorkerModels = signal(false);
  protected readonly downloading = signal<Record<string, boolean>>({});
  protected readonly deleting = signal<Record<string, boolean>>({});

  protected readonly providerOptions: ProviderOption[] = [
    { label: 'BytePlus', value: 'byteplus', icon: 'md md-videocam' },
    { label: 'Gemini', value: 'gemini', icon: 'md md-image' },
    { label: 'Anthropic', value: 'anthropic', icon: 'md md-description' },
    { label: 'Higgsfield', value: 'higgsfield', icon: 'md md-inventory_2' },
    { label: 'OpenRouter', value: 'openrouter', icon: 'md md-smart-toy' },
    { label: 'Ollama', value: 'ollama', icon: 'md md-computer' },
    { label: 'LM Studio', value: 'lmstudio', icon: 'md md-computer' },
  ];

  /** Servidores OpenAI-compatibles que corre el propio tenant: no llevan API
   *  key y sus modelos se descubren en vivo desde /v1/models. */
  protected readonly localProviders: CredentialProviderType[] = ['ollama', 'lmstudio'];

  protected isLocalProvider(provider: CredentialProviderType | null): boolean {
    return provider !== null && this.localProviders.includes(provider);
  }

  /** La base URL se edita para los LLM hospedados y para los locales (puerto
   *  propio, túnel, etc.). */
  protected showsBaseURL(provider: CredentialProviderType | null): boolean {
    return this.showsAgentModel(provider) || this.isLocalProvider(provider);
  }

  /** Proveedores LLM: su credencial además lleva el modelo del agente de
   *  agencia (flujo Inmobiliaria), guardado en `extra.model`. */
  protected readonly agentModelProviders: CredentialProviderType[] = ['openrouter', 'anthropic'];

  protected readonly credForm = this.formBuilder.group({
    provider: this.formBuilder.control<CredentialProviderType | null>(null, Validators.required),
    access_key_id: [''],
    secret_access_key: [''],
    api_key: [''],
    model: [''],
    base_url: [''],
  });

  constructor() {
    // Cambiar de tenant en el header recarga credenciales y modelos.
    effect(() => {
      const tenantId = this.selectedTenantId();
      this.models.set([]);
      this.credentials.set([]);
      this.credForm.reset();
      if (tenantId !== null) {
        this.loadTenantConfig(tenantId);
      }
    });
  }

  private loadTenantConfig(tenantId: number): void {
    this.loadingConfig.set(true);
    this.error.set(null);

    forkJoin({
      models: this.adminService.listTenantModels(tenantId).pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.LOAD_MODELS'));
          return EMPTY;
        }),
      ),
      credentials: this.adminService.listTenantCredentials(tenantId).pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.LOAD_CREDENTIALS'));
          return EMPTY;
        }),
      ),
      workerModels: this.adminService.listWorkerModels().pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.LOAD_WORKER_MODELS'));
          return EMPTY;
        }),
      ),
    })
      .pipe(finalize(() => this.loadingConfig.set(false)))
      .subscribe(({ models, credentials, workerModels }) => {
        this.models.set(models);
        this.credentials.set(credentials);
        this.workerModels.set(workerModels);
      });
  }

  protected credentialForProvider(provider: CredentialProviderType): TenantCredential | null {
    return this.credentials().find((c) => c.provider === provider) ?? null;
  }

  /** Modelo del agente guardado en la credencial (extra.model). */
  protected modelOf(cred: TenantCredential): string {
    try {
      const extra = JSON.parse(cred.extra ?? '{}') as { model?: string };
      return extra.model ?? '';
    } catch {
      return '';
    }
  }

  /** Al elegir proveedor se precarga su modelo/base URL guardados. */
  protected onProviderChange(provider: CredentialProviderType | null): void {
    const cred = provider ? this.credentialForProvider(provider) : null;
    this.credForm.controls.model.setValue(cred ? this.modelOf(cred) : '');
    this.credForm.controls.base_url.setValue(cred?.base_url ?? '');
  }

  protected showsAgentModel(provider: CredentialProviderType | null): boolean {
    return provider !== null && this.agentModelProviders.includes(provider);
  }

  protected isModelConfigured(model: TenantModel): boolean {
    return (
      this.credentialForProvider(model.credential_provider) !== null || model.credential_configured
    );
  }

  protected saveCredential(): void {
    const tenantId = this.selectedTenantId();
    if (!tenantId || this.credForm.invalid || this.savingCredential()) {
      this.credForm.markAllAsTouched();
      return;
    }

    const { provider, access_key_id, secret_access_key, api_key, model, base_url } =
      this.credForm.getRawValue();
    if (!provider) return;

    // Higgsfield autentica con Key ID + Key Secret (no usa api_key); el resto
    // de proveedores requieren api_key — salvo que ya exista una credencial
    // guardada: así se puede actualizar solo el modelo sin repegar la key
    // (el back preserva los secretos vacíos).
    if (provider === 'higgsfield') {
      if (!access_key_id.trim() || !secret_access_key.trim()) {
        this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.HIGGSFIELD_KEYS'));
        return;
      }
    } else if (this.isLocalProvider(provider)) {
      // Los servidores locales no autentican: lo único obligatorio es saber
      // dónde escuchan (la primera vez; después se puede editar el resto).
      if (!base_url.trim() && !this.credentialForProvider(provider)) {
        this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.BASE_URL_REQUIRED'));
        return;
      }
    } else if (!api_key.trim() && !this.credentialForProvider(provider)) {
      this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.API_KEY_REQUIRED'));
      return;
    }

    const payload: UpsertTenantCredentialRequest = { provider };
    if (api_key.trim()) payload.api_key = api_key.trim();
    if (access_key_id.trim()) payload.access_key_id = access_key_id.trim();
    if (secret_access_key.trim()) payload.secret_access_key = secret_access_key.trim();
    // Los proveedores LLM guardan acá el modelo/base URL del asistente de
    // agencia; el modelo se envía siempre — `{"model":""}` lo limpia.
    if (this.showsAgentModel(provider)) {
      payload.extra = JSON.stringify({ model: model.trim() });
    }
    if (this.showsBaseURL(provider) && base_url.trim()) {
      payload.base_url = base_url.trim();
    }

    this.savingCredential.set(true);
    this.error.set(null);
    this.saved.set(false);

    this.adminService
      .upsertTenantCredential(tenantId, payload)
      .pipe(
        tap(() => {
          this.credForm.reset();
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 3000);
        }),
        switchMap(() => this.adminService.listTenantCredentials(tenantId)),
        catchError((err: unknown) => {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message)
              : null;
          this.error.set(msg || this.translate.instant('ADMIN.MODELS.ERRORS.SAVE_CREDENTIAL'));
          return EMPTY;
        }),
        finalize(() => this.savingCredential.set(false)),
      )
      .subscribe((credentials) => {
        this.credentials.set(credentials);
        this.loadModelsOnly(tenantId);
      });
  }

  private loadModelsOnly(tenantId: number): void {
    this.adminService
      .listTenantModels(tenantId)
      .pipe(catchError(() => EMPTY))
      .subscribe((models) => this.models.set(models));
  }

  protected confirmDeleteCredential(cred: TenantCredential): void {
    const tenantId = this.selectedTenantId();
    if (!tenantId) return;

    this.confirmationService.confirm({
      message: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_MESSAGE', {
        provider: cred.provider,
      }),
      header: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_TITLE'),
      icon: 'md md-warning',
      acceptLabel: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_ACCEPT'),
      rejectLabel: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_REJECT'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.adminService
          .deleteTenantCredential(tenantId, cred.provider)
          .pipe(
            switchMap(() => this.adminService.listTenantCredentials(tenantId)),
            catchError(() => {
              this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.DELETE_CREDENTIAL'));
              return EMPTY;
            }),
          )
          .subscribe((credentials) => {
            this.credentials.set(credentials);
            this.loadModelsOnly(tenantId);
          });
      },
    });
  }

  protected providerLabel(provider: string): string {
    return this.providerOptions.find((p) => p.value === provider)?.label ?? provider;
  }

  /** Descarga el JSON de credenciales (con secretos) del tenant seleccionado. */
  protected exportCredentials(): void {
    const tenantId = this.selectedTenantId();
    if (!tenantId || this.exporting()) return;

    this.exporting.set(true);
    this.error.set(null);
    this.adminService
      .exportTenantCredentials(tenantId)
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: (response: HttpResponse<Blob>) => {
          const body = response.body;
          if (!body) {
            this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.EXPORT_EMPTY'));
            return;
          }
          const url = URL.createObjectURL(body);
          const a = document.createElement('a');
          a.href = url;
          a.download = `credentials-tenant-${tenantId}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.EXPORT')),
      });
  }

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so selecting the same file again re-triggers change.
    input.value = '';
    if (file) this.importCredentials(file);
  }

  private importCredentials(file: File): void {
    const tenantId = this.selectedTenantId();
    if (!tenantId || this.importing()) return;

    this.importing.set(true);
    this.error.set(null);
    this.adminService
      .importTenantCredentials(tenantId, file)
      .pipe(
        switchMap(({ imported }) =>
          forkJoin({
            models: this.adminService.listTenantModels(tenantId).pipe(catchError(() => EMPTY)),
            credentials: this.adminService.listTenantCredentials(tenantId),
          }).pipe(
            tap(() =>
              this.savedMessage.set(
                this.translate.instant('ADMIN.MODELS.IMPORTED_MESSAGE', { count: imported }),
              ),
            ),
          ),
        ),
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.IMPORT'));
          return EMPTY;
        }),
        finalize(() => this.importing.set(false)),
      )
      .subscribe(({ models, credentials }) => {
        this.models.set(models);
        this.credentials.set(credentials);
        setTimeout(() => this.savedMessage.set(null), 3000);
      });
  }

  protected modalitySeverity(modality: string): 'success' | 'info' | 'warn' {
    switch (modality) {
      case 'video':
        return 'success';
      case 'image':
        return 'info';
      default:
        return 'warn';
    }
  }

  // ─── Worker model actions ─────────────────────────────────────────

  protected isDownloading(key: string): boolean {
    return !!this.downloading()[key];
  }

  protected isDeleting(key: string): boolean {
    return !!this.deleting()[key];
  }

  protected downloadWorkerModel(model: WorkerModel): void {
    if (model.downloading || model.downloaded) return;

    this.downloading.update((d) => ({ ...d, [model.key]: true }));
    this.error.set(null);

    this.adminService
      .downloadWorkerModel(model.key)
      .pipe(
        tap(() => this.loadWorkerModels()),
        catchError((err: unknown) => {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message)
              : null;
          this.error.set(
            msg || this.translate.instant('ADMIN.MODELS.ERRORS.DOWNLOAD_WORKER_MODEL'),
          );
          return EMPTY;
        }),
        finalize(() => {
          this.downloading.update((d) => {
            const { [model.key]: _removed, ...rest } = d;
            return rest;
          });
        }),
      )
      .subscribe();
  }

  protected cancelWorkerModelDownload(model: WorkerModel): void {
    if (!model.downloading) return;

    this.downloading.update((d) => ({ ...d, [model.key]: true }));
    this.error.set(null);

    this.adminService
      .cancelWorkerModelDownload(model.key)
      .pipe(
        tap(() => this.loadWorkerModels()),
        catchError((err: unknown) => {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message)
              : null;
          this.error.set(msg || this.translate.instant('ADMIN.MODELS.ERRORS.CANCEL_DOWNLOAD'));
          return EMPTY;
        }),
        finalize(() => {
          this.downloading.update((d) => {
            const { [model.key]: _removed, ...rest } = d;
            return rest;
          });
        }),
      )
      .subscribe();
  }

  protected confirmDeleteWorkerModel(model: WorkerModel): void {
    this.confirmationService.confirm({
      message: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_WORKER_MODEL', {
        model: model.label || model.key,
      }),
      header: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_TITLE'),
      icon: 'md md-warning',
      acceptLabel: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_ACCEPT'),
      rejectLabel: this.translate.instant('ADMIN.MODELS.CONFIRM_DELETE_REJECT'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.deleting.update((d) => ({ ...d, [model.key]: true }));
        this.error.set(null);
        this.adminService
          .deleteWorkerModel(model.key)
          .pipe(
            tap(() => this.loadWorkerModels()),
            catchError((err: unknown) => {
              const msg =
                err && typeof err === 'object' && 'message' in err
                  ? String((err as { message?: unknown }).message)
                  : null;
              this.error.set(
                msg || this.translate.instant('ADMIN.MODELS.ERRORS.DELETE_WORKER_MODEL'),
              );
              return EMPTY;
            }),
            finalize(() => {
              this.deleting.update((d) => {
                const { [model.key]: _removed, ...rest } = d;
                return rest;
              });
            }),
          )
          .subscribe();
      },
    });
  }

  private loadWorkerModels(): void {
    this.loadingWorkerModels.set(true);
    this.adminService
      .listWorkerModels()
      .pipe(
        catchError(() => EMPTY),
        finalize(() => this.loadingWorkerModels.set(false)),
      )
      .subscribe((models) => this.workerModels.set(models));
  }

  /** Formatea bytes para mostrar en la UI. */
  protected formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
