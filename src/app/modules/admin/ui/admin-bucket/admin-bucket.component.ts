import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AdminTenantService } from '../../services/admin-tenant.service';
import { TenantStorageDialogComponent } from '../tenant-storage-dialog/tenant-storage-dialog.component';

/** Bucket (S3/MinIO) del tenant seleccionado, embebido en la consola. */
@Component({
  selector: 'app-admin-bucket',
  imports: [TenantStorageDialogComponent, TranslatePipe],
  templateUrl: './admin-bucket.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBucketComponent {
  private readonly adminTenants = inject(AdminTenantService);

  protected readonly tenant = this.adminTenants.selectedTenant;
}
