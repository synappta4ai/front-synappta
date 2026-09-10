import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { AdminService } from '../../services/admin.service';
import { Tenant } from '../../interfaces';

@Component({
  selector: 'app-admin-tenants',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './tenants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantsComponent {
  private readonly adminService = inject(AdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

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

  protected deactivateTenant(id: number): void {
    this.adminService
      .deactivateTenant(id)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo desactivar el tenant.');
          return EMPTY;
        }),
      )
      .subscribe(() => this.loadTenants());
  }
}
