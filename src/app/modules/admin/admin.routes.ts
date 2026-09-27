import { Routes } from '@angular/router';

import { authGuard } from '@guards/auth.guard';
import { superadminGuard } from '@guards/superadmin.guard';

import { AdminConsoleComponent } from './ui/admin-console/admin-console.component';
import { AdminModelsComponent } from './ui/admin-models/admin-models.component';
import { AdminLogsComponent } from './ui/admin-logs/admin-logs.component';
import { AdminVideosComponent } from './ui/admin-videos/admin-videos.component';
import { AdminImagesComponent } from './ui/admin-images/admin-images.component';
import { TenantsComponent } from './ui/tenants/tenants.component';

export const adminRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: AdminConsoleComponent,
    children: [
      { path: 'models', component: AdminModelsComponent },
      { path: 'logs', component: AdminLogsComponent },
      { path: 'videos', component: AdminVideosComponent },
      { path: 'imagens', component: AdminImagesComponent },
      {
        path: 'tenants',
        component: TenantsComponent,
        canActivate: [superadminGuard],
      },
      { path: '', redirectTo: 'models', pathMatch: 'full' },
    ],
  },
];
