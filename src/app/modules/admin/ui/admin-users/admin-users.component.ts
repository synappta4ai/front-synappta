import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminTenantService } from '../../services/admin-tenant.service';
import { TenantUsersDialogComponent } from '../tenant-users-dialog/tenant-users-dialog.component';

/** Usuarios del tenant seleccionado, embebido en la consola (sin diálogo). */
@Component({
  selector: 'app-admin-users',
  imports: [TenantUsersDialogComponent, TranslatePipe],
  templateUrl: './admin-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent {
  private readonly adminTenants = inject(AdminTenantService);

  protected readonly tenant = this.adminTenants.selectedTenant;
}
