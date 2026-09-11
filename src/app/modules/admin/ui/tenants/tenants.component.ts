import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Message } from 'primeng/message';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ProgressSpinner } from 'primeng/progressspinner';

import { AdminService } from '../../services/admin.service';
import { Tenant } from '../../interfaces';
import { PageContainerComponent } from '@shared/components/index';

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
    Message,
    ConfirmDialog,
    ProgressSpinner,
  ],
  providers: [ConfirmationService],
  templateUrl: './tenants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantsComponent {
  private readonly adminService = inject(AdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly tenants = signal<readonly Tenant[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);

  protected readonly form = this.formBuilder.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
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
          this.error.set('No se pudieron cargar los tenants.');
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
          this.error.set('No se pudo crear el tenant.');
          return EMPTY;
        }),
        finalize(() => this.creating.set(false)),
      )
      .subscribe(() => {
        this.form.reset();
        this.loadTenants();
      });
  }

  protected confirmDeactivate(tenant: Tenant): void {
    this.confirmationService.confirm({
      message: `¿Estás seguro de que quieres desactivar el tenant "${tenant.name}"?`,
      header: 'Confirmar desactivación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.adminService
          .deactivateTenant(tenant.id)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo desactivar el tenant.');
              return EMPTY;
            }),
          )
          .subscribe(() => this.loadTenants());
      },
    });
  }
}
