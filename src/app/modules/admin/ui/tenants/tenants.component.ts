import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Message } from 'primeng/message';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { AdminService } from '../../services/admin.service';
import { Tenant } from '../../interfaces';
import { PageContainerComponent } from '@shared/components/index';
import { CountUpDirective } from '@shared/components/count-up/count-up.directive';
import { TenantUsersDialogComponent } from '../tenant-users-dialog/tenant-users-dialog.component';
import { TenantStorageDialogComponent } from '../tenant-storage-dialog/tenant-storage-dialog.component';

@Component({
  selector: 'app-admin-tenants',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageContainerComponent,
    Button,
    Card,
    InputText,
    TableModule,
    Tag,
    Tooltip,
    Message,
    ConfirmDialog,
    CountUpDirective,
    TenantUsersDialogComponent,
    TenantStorageDialogComponent,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './tenants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantsComponent {
  private readonly adminService = inject(AdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  protected readonly tenants = signal<readonly Tenant[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);

  /** Tenant cuyo diálogo de usuarios está abierto (null = cerrado). */
  protected readonly usersTenant = signal<Tenant | null>(null);

  /** Tenant cuyo diálogo de bucket está abierto (null = cerrado). */
  protected readonly storageTenant = signal<Tenant | null>(null);

  /** Formulario de creación de tenants. */
  protected readonly form = this.formBuilder.group({
    name: ['', Validators.required],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]{1,54}$/)]],
  });

  constructor() {
    this.loadTenants();
  }

  protected loadTenants(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService
      .listTenants()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.TENANTS.ERRORS.LOAD'));
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((tenants) => this.tenants.set(tenants));
  }

  protected createTenant(): void {
    if (this.form.invalid || this.creating()) {
      this.form.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.error.set(null);
    const { name, slug } = this.form.getRawValue();

    this.adminService
      .createTenant({ name, slug })
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('ADMIN.TENANTS.ERRORS.CREATE'));
          return EMPTY;
        }),
        finalize(() => this.creating.set(false)),
      )
      .subscribe(() => {
        this.form.reset();
        this.loadTenants();
      });
  }

  protected openUsers(tenant: Tenant): void {
    this.usersTenant.set(tenant);
  }

  /** Refresca la fila del tenant cuando cambiaron sus permisos de empresa. */
  protected onTenantPermissionsChanged(change: { tenantId: number; permissions: string[] }): void {
    this.tenants.update((list) =>
      list.map((t) => (t.id === change.tenantId ? { ...t, permissions: change.permissions } : t)),
    );
  }

  protected closeUsers(): void {
    this.usersTenant.set(null);
  }

  /** Credenciales del bucket (S3/MinIO) del tenant. */
  protected openStorage(tenant: Tenant): void {
    this.storageTenant.set(tenant);
  }

  protected closeStorage(): void {
    this.storageTenant.set(null);
  }

  protected confirmDeactivate(tenant: Tenant): void {
    this.confirmationService.confirm({
      message: this.translate.instant('ADMIN.TENANTS.CONFIRM_DEACTIVATE_MESSAGE', {
        name: tenant.name,
      }),
      header: this.translate.instant('ADMIN.TENANTS.CONFIRM_DEACTIVATE_TITLE'),
      icon: 'md md-warning',
      acceptLabel: this.translate.instant('ADMIN.TENANTS.CONFIRM_DEACTIVATE_ACCEPT'),
      rejectLabel: this.translate.instant('ADMIN.TENANTS.CONFIRM_DEACTIVATE_REJECT'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.adminService
          .deactivateTenant(tenant.id)
          .pipe(
            catchError(() => {
              this.error.set(this.translate.instant('ADMIN.TENANTS.ERRORS.DEACTIVATE'));
              return EMPTY;
            }),
          )
          .subscribe(() => this.loadTenants());
      },
    });
  }
}
