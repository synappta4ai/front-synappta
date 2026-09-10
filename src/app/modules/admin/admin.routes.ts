import { Routes } from '@angular/router';

import { superadminGuard } from '@guards/superadmin.guard';

export const adminRoutes: Routes = [
  {
    path: 'tenants',
    title: 'Gestión de Tenants',
    canActivate: [superadminGuard],
    loadComponent: () => import('./ui/tenants/tenants.component').then((m) => m.TenantsComponent),
  },
];
