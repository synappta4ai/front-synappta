import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
import { Tooltip } from 'primeng/tooltip';

import { UserSessionStore } from '@core/store/user.session';
import { AdminService } from '../../services/admin.service';
import {
  CredentialProviderType,
  Tenant,
  TenantCredential,
  TenantModel,
  UpsertTenantCredentialRequest,
} from '../../interfaces';

interface ProviderOption {
  label: string;
  value: CredentialProviderType;
  icon: string;
}

interface TenantOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-admin-models',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    InputText,
    TableModule,
    Tag,
    Message,
    ConfirmDialog,
    Select,
    Password,
    Tooltip,
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-models.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModelsComponent {
  private readonly adminService = inject(AdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly sessionStore = inject(UserSessionStore);

  protected readonly isSuperadmin = computed(
    () => this.sessionStore.currentUser()?.role_level === 0,
  );

  protected readonly tenants = signal<Tenant[]>([]);
  protected readonly selectedTenantId = signal<number | null>(null);
  protected readonly loadingTenants = signal(false);

  protected readonly models = signal<TenantModel[]>([]);
  protected readonly credentials = signal<TenantCredential[]>([]);
  protected readonly loadingConfig = signal(false);
  protected readonly savingCredential = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly savedMessage = signal<string | null>(null);

  protected readonly providerOptions: ProviderOption[] = [
    { label: 'BytePlus', value: 'byteplus', icon: 'md md-videocam' },
    { label: 'Gemini', value: 'gemini', icon: 'md md-image' },
    { label: 'Anthropic', value: 'anthropic', icon: 'md md-description' },
    { label: 'Higgsfield', value: 'higgsfield', icon: 'md md-inventory_2' },
  ];

  protected readonly tenantOptions = computed<TenantOption[]>(() =>
    this.tenants()
      .filter((t) => t.active)
      .map((t) => ({ label: `${t.name} (${t.slug})`, value: t.id })),
  );

  protected readonly selectedTenant = computed(
    () => this.tenants().find((t) => t.id === this.selectedTenantId()) ?? null,
  );

  protected readonly credForm = this.formBuilder.group({
    provider: this.formBuilder.control<CredentialProviderType | null>(null, Validators.required),
    access_key_id: [''],
    secret_access_key: [''],
    api_key: [''],
  });

  constructor() {
    if (this.isSuperadmin()) {
      this.loadTenants();
    } else {
      // El admin de tenant opera sobre su propio tenant (viene en el token).
      this.loadOwnTenantConfig();
    }
  }

  /** Carga el tenant del token sin pasar por el selector. */
  private loadOwnTenantConfig(): void {
    const tenantId = this.sessionStore.getTenantId();
    if (tenantId) {
      this.selectedTenantId.set(tenantId);
      this.loadTenantConfig(tenantId);
    }
  }

  private loadTenants(): void {
    this.loadingTenants.set(true);
    this.adminService
      .listTenants()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los tenants.');
          return EMPTY;
        }),
        finalize(() => this.loadingTenants.set(false)),
      )
      .subscribe((tenants) => this.tenants.set(tenants));
  }

  protected onTenantSelect(tenantId: number | null): void {
    this.selectedTenantId.set(tenantId);
    this.models.set([]);
    this.credentials.set([]);
    this.credForm.reset();
    if (tenantId) {
      this.loadTenantConfig(tenantId);
    }
  }

  private loadTenantConfig(tenantId: number): void {
    this.loadingConfig.set(true);
    this.error.set(null);

    forkJoin({
      models: this.adminService.listTenantModels(tenantId).pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos del tenant.');
          return EMPTY;
        }),
      ),
      credentials: this.adminService.listTenantCredentials(tenantId).pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar las credenciales del tenant.');
          return EMPTY;
        }),
      ),
    })
      .pipe(finalize(() => this.loadingConfig.set(false)))
      .subscribe(({ models, credentials }) => {
        this.models.set(models);
        this.credentials.set(credentials);
      });
  }

  protected credentialForProvider(provider: CredentialProviderType): TenantCredential | null {
    return this.credentials().find((c) => c.provider === provider) ?? null;
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

    const { provider, access_key_id, secret_access_key, api_key } = this.credForm.getRawValue();
    if (!provider) return;

    // Higgsfield autentica con Key ID + Key Secret (no usa api_key); el resto
    // de proveedores requieren api_key.
    if (provider === 'higgsfield') {
      if (!access_key_id.trim() || !secret_access_key.trim()) {
        this.error.set('Higgsfield necesita Key ID y Key Secret.');
        return;
      }
    } else if (!api_key.trim()) {
      this.error.set('La API Key es obligatoria para este proveedor.');
      return;
    }

    const payload: UpsertTenantCredentialRequest = { provider };
    if (api_key.trim()) payload.api_key = api_key.trim();
    if (access_key_id.trim()) payload.access_key_id = access_key_id.trim();
    if (secret_access_key.trim()) payload.secret_access_key = secret_access_key.trim();

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
          this.error.set(msg || 'No se pudo guardar la credencial.');
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
      message: `¿Eliminar la credencial de "${cred.provider}"? Los modelos que la usen dejarán de funcionar.`,
      header: 'Confirmar eliminación',
      icon: 'md md-warning',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.adminService
          .deleteTenantCredential(tenantId, cred.provider)
          .pipe(
            switchMap(() => this.adminService.listTenantCredentials(tenantId)),
            catchError(() => {
              this.error.set('No se pudo eliminar la credencial.');
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
            this.error.set('La exportación vino vacía.');
            return;
          }
          const url = URL.createObjectURL(body);
          const a = document.createElement('a');
          a.href = url;
          a.download = `credentials-tenant-${tenantId}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.error.set('No se pudieron exportar las credenciales.'),
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
          }).pipe(tap(() => this.savedMessage.set(`Se importaron ${imported} credencial(es).`))),
        ),
        catchError(() => {
          this.error.set('No se pudo importar el archivo de credenciales.');
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
}
