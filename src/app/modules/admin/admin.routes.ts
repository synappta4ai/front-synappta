import { Routes } from '@angular/router';

import { authGuard } from '@guards/auth.guard';
import { superadminGuard } from '@guards/superadmin.guard';

import { AdminConsoleComponent } from './ui/admin-console/admin-console.component';
import { AdminModelMasterComponent } from './ui/admin-model-master/admin-model-master.component';
import { AdminModelsComponent } from './ui/admin-models/admin-models.component';
import { AdminLogsComponent } from './ui/admin-logs/admin-logs.component';
import { AdminVideosComponent } from './ui/admin-videos/admin-videos.component';
import { AdminImagesComponent } from './ui/admin-images/admin-images.component';
import { AdminGpuComponent } from './ui/admin-gpu/admin-gpu.component';
import { AdminUsersComponent } from './ui/admin-users/admin-users.component';
import { AdminBucketComponent } from './ui/admin-bucket/admin-bucket.component';
import { TenantsComponent } from './ui/tenants/tenants.component';

export const adminRoutes: Routes = [
  {
    path: '',
    // Toda la consola es solo para superadmin (role_level 0): el back ya
    // rechaza los datos con 403 para roles inferiores, acá evitamos
    // renderizar la consola vacía.
    canActivate: [authGuard, superadminGuard],
    component: AdminConsoleComponent,
    children: [
      { path: 'models', component: AdminModelsComponent },
      { path: 'maestro', component: AdminModelMasterComponent },
      { path: 'logs', component: AdminLogsComponent },
      { path: 'videos', component: AdminVideosComponent },
      { path: 'imagenes', component: AdminImagesComponent },
      // Ruta histórica con el typo, para no romper links guardados.
      { path: 'imagens', redirectTo: 'imagenes', pathMatch: 'full' },
      { path: 'gpu', component: AdminGpuComponent },
      { path: 'users', component: AdminUsersComponent },
      { path: 'bucket', component: AdminBucketComponent },
      { path: 'tenants', component: TenantsComponent },
      { path: '', redirectTo: 'models', pathMatch: 'full' },
    ],
  },
];
