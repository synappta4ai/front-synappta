import { Routes } from '@angular/router';

import { authGuard } from '@guards/auth.guard';
import { superadminGuard, tenantAdminGuard } from '@core/guards';

import { AdminConsoleComponent } from './ui/admin-console/admin-console.component';
import { AdminModelMasterComponent } from './ui/admin-model-master/admin-model-master.component';
import { AdminModelsComponent } from './ui/admin-models/admin-models.component';
import { AdminLogsComponent } from './ui/admin-logs/admin-logs.component';
import { AdminVideosComponent } from './ui/admin-videos/admin-videos.component';
import { AdminImagesComponent } from './ui/admin-images/admin-images.component';
import { AdminGpuComponent } from './ui/admin-gpu/admin-gpu.component';
import { AdminUsersComponent } from './ui/admin-users/admin-users.component';
import { AdminBucketComponent } from './ui/admin-bucket/admin-bucket.component';
import { AdminNotificationsComponent } from './ui/admin-notifications/admin-notifications.component';
import { TenantsComponent } from './ui/tenants/tenants.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminConsoleComponent,
    children: [
      {
        path: 'models',
        canActivate: [tenantAdminGuard],
        component: AdminModelsComponent,
      },
      { path: 'maestro', canActivate: [authGuard, superadminGuard], component: AdminModelMasterComponent },
      { path: 'logs', component: AdminLogsComponent },
      { path: 'videos', component: AdminVideosComponent },
      { path: 'imagenes', component: AdminImagesComponent },
      // Ruta histórica con el typo, para no romper links guardados.
      { path: 'imagens', redirectTo: 'imagenes', pathMatch: 'full' },
      { path: 'gpu', component: AdminGpuComponent },
      { path: 'users', component: AdminUsersComponent },
      { path: 'bucket', component: AdminBucketComponent },
      { path: 'notifications', component: AdminNotificationsComponent },
      // Tolera el typo histórico del menú: /admin/notications → /admin/notifications.
      { path: 'notications', redirectTo: 'notifications', pathMatch: 'full' },
      { path: 'tenants', component: TenantsComponent },
      { path: '', redirectTo: 'models', pathMatch: 'full' },
    ],
  },
];
