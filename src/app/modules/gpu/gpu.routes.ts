import { Routes } from '@angular/router';

import { tenantAdminGuard } from '@core/guards';

import { GpuPanelComponent } from './ui/gpu-panel/gpu-panel.component';

/**
 * Rutas del panel "Tu GPU". Accesible para administradores del tenant
 * (el back aplica RequireRole(1) en los endpoints).
 */
export const gpuRoutes: Routes = [
  {
    path: '',
    canActivate: [tenantAdminGuard],
    component: GpuPanelComponent,
  },
];
