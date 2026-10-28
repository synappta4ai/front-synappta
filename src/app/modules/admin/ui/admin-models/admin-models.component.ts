import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { Tooltip } from 'primeng/tooltip';

import { AdminService } from '../../services/admin.service';
import { AdminTenantService } from '../../services/admin-tenant.service';
import { ModelCatalogService } from '@modules/agency/services';
import {
  CredentialProviderType,
  TenantCredential,
  TenantModel,
  UpsertTenantCredentialRequest,
} from '../../interfaces';

interface ProviderOption {
  label: string;
  value: CredentialProviderType;
  icon: string;
}

@Component({
  selector: 'app-admin-models',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    Button,
    InputText,
    TableModule,
    Tag,
    Message,
    ConfirmDialog,
    Select,
    Password,
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
  private readonly catalog = inject(ModelCatalogService);
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

  // ─── Filtros del catálogo de proveedores ──────────────────────────
  // Los modelos del worker viven en su ruta propia (/admin/gpu): acá solo
  // proveedores externos (API key del tenant).
  protected readonly search = signal('');
  protected readonly providerFilter = signal<string | null>(null);
  protected readonly modalityFilter = signal<string | null>(null);

  /** Proveedores presentes en el catálogo (para el filtro). */
  protected readonly providerFilterOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const m of this.models()) {
      if (m.credential_provider && !seen.has(m.credential_provider)) {
        seen.set(m.credential_provider, this.providerLabel(m.credential_provider));
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Modalidades presentes en el catálogo (para el filtro). */
  protected readonly modalityFilterOptions = computed(() => {
    const seen = new Set<string>();
    for (const m of this.models()) {
      if (m.modality) seen.add(m.modality);
    }
    return [...seen].sort().map((modality) => ({ label: modality, value: modality }));
  });

  /** Modelos de proveedor filtrados (proveedor + tipo + texto). */
  protected readonly filteredModels = computed(() => {
    const query = this.search().trim().toLowerCase();
    const provider = this.providerFilter();
    const modality = this.modalityFilter();
    return this.models().filter((m) => {
      if (provider && m.credential_provider !== provider) return false;
      if (modality && m.modality !== modality) return false;
      if (query) {
        const haystack = `${m.display_name ?? ''} ${m.name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  protected clearFilters(): void {
    this.search.set('');
    this.providerFilter.set(null);
    this.modalityFilter.set(null);
  }

  protected readonly providerOptions: ProviderOption[] = [
    { label: 'BytePlus', value: 'byteplus', icon: 'md md-videocam' },
    { label: 'Gemini', value: 'gemini', icon: 'md md-image' },
    { label: 'Anthropic', value: 'anthropic', icon: 'md md-description' },
    { label: 'Higgsfield', value: 'higgsfield', icon: 'md md-inventory_2' },
    { label: 'OpenRouter', value: 'openrouter', icon: 'md md-smart-toy' },
    { label: 'Ollama', value: 'ollama', icon: 'md md-computer' },
    { label: 'LM Studio', value: 'lmstudio', icon: 'md md-computer' },
    // Inference providers hospedados: el tenant trae su key y el catálogo
    // lista en vivo los modelos que esa key alcanza.
    { label: 'RunPod', value: 'runpod', icon: 'md md-cloud' },
    { label: 'Together AI', value: 'together', icon: 'md md-hub' },
    { label: 'DeepInfra', value: 'deepinfra', icon: 'md md-memory' },
    { label: 'GMI Cloud', value: 'gmi', icon: 'md md-cloud-queue' },
    { label: 'Baseten', value: 'baseten', icon: 'md md-layers' },
    { label: 'Vultr', value: 'vultr', icon: 'md md-dns' },
    { label: 'DigitalOcean', value: 'digitalocean', icon: 'md md-water' },
    { label: 'CoreWeave', value: 'coreweave', icon: 'md md-grain' },
  ];

  /** Servidores OpenAI-compatibles que corre el propio tenant: no llevan API
   *  key y sus modelos se descubren en vivo desde /v1/models. */
  protected readonly localProviders: CredentialProviderType[] = ['ollama', 'lmstudio'];

  /** Nubes de inferencia hospedadas: API key + endpoints OpenAI-compatibles
   *  (RunPod además lleva el id de su serverless endpoint). */
  protected readonly inferenceProviders: CredentialProviderType[] = [
    'runpod',
    'together',
    'deepinfra',
    'gmi',
    'baseten',
    'vultr',
    'digitalocean',
    'coreweave',
  ];

  protected isLocalProvider(provider: CredentialProviderType | null): boolean {
    return provider !== null && this.localProviders.includes(provider);
  }

  /** RunPod publica un endpoint por modelo: el id va en la credencial y el
   *  modelo aparece como runpod/<endpoint-id>. */
  protected isRunPod(provider: CredentialProviderType | null): boolean {
    return provider === 'runpod';
  }

  protected isInferenceProvider(provider: CredentialProviderType | null): boolean {
    return provider !== null && this.inferenceProviders.includes(provider);
  }

  /** La base URL se edita para los LLM hospedados, los locales (puerto
   *  propio, túnel, etc.) y las nubes de inferencia (gateway/region propia). */
  protected showsBaseURL(provider: CredentialProviderType | null): boolean {
    return (
      this.showsAgentModel(provider) || this.isLocalProvider(provider) || this.isInferenceProvider(provider)
    );
  }

  /** RunPod necesita el endpoint id para poder armar el modelo. */
  protected showsEndpointId(provider: CredentialProviderType | null): boolean {
    return this.isRunPod(provider);
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
    endpoint_id: [''],
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
    })
      .pipe(finalize(() => this.loadingConfig.set(false)))
      .subscribe(({ models, credentials }) => {
        this.models.set(models);
        this.credentials.set(credentials);
        this.clearFilters();
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
    this.credForm.controls.endpoint_id.setValue(cred ? this.endpointIdOf(cred) : '');
  }

  /** Endpoint de RunPod guardado en la credencial (`extra.endpoint_id`). */
  protected endpointIdOf(cred: TenantCredential): string {
    try {
      const extra = JSON.parse(cred.extra ?? '{}') as { endpoint_id?: string };
      return extra.endpoint_id ?? '';
    } catch {
      return '';
    }
  }

  /** Endpoint id ya guardado para el proveedor (sin leer el formulario). */
  private savedEndpointId(provider: CredentialProviderType): string {
    const cred = this.credentialForProvider(provider);
    return cred ? this.endpointIdOf(cred) : '';
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

    const { provider, access_key_id, secret_access_key, api_key, model, base_url, endpoint_id } =
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
    // RunPod: el endpoint id es lo que convierte la credencial en un modelo
    // (runpod/<endpoint-id>). Sin él la nube no puede listar nada.
    if (this.isRunPod(provider) && !endpoint_id.trim() && !this.savedEndpointId(provider)) {
      this.error.set(this.translate.instant('ADMIN.MODELS.ERRORS.ENDPOINT_ID_REQUIRED'));
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
    // Solo se envía cuando hay valor: un extra vacío borraría el endpoint
    // guardado al editar la base URL.
    if (this.isRunPod(provider) && endpoint_id.trim()) {
      payload.extra = JSON.stringify({ endpoint_id: endpoint_id.trim() });
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
        this.catalog.refresh();
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
            this.catalog.refresh();
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
}


