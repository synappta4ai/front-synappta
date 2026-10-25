import { Routes } from '@angular/router';

import { tenantAdminGuard } from '@core/guards';

import { TenantModelsComponent } from './ui/tenant-models/tenant-models.component';

/**
 * "Mis modelos": curaduría propia del tenant (admin del tenant,
 * role_level ≤ 1 — el back aplica RequireRole(1) en los endpoints).
 * Hereda lo que el maestro deja activo y ajusta: desactivar más y marcar
 * favoritos propios (varios, con orden).
 */
export const tenantModelsRoutes: Routes = [
  {
    path: '',
    canActivate: [tenantAdminGuard],
    component: TenantModelsComponent,
  },
];
