import { Routes } from '@angular/router';
import { superadminGuard } from '@core/guards';

import { authGuard, notAuthGuard } from '@guards/auth.guard';
import { PrivateLayoutComponent } from '@shared/components/layouts/private-layout/private-layout.component';
import { PublicLayoutComponent } from '@shared/components/layouts/public-layout/public-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      {
        path: '',
        loadChildren: () => import('@modules/home/home.routes').then((m) => m.homeRoutes),
      },
      {
        path: 'auth',
        canActivate: [notAuthGuard],
        loadChildren: () => import('@modules/auth/auth.routes').then((m) => m.authRoutes),
      },
    ],
  },
  {
    path: '',
    component: PrivateLayoutComponent,
    children: [
      {
        path: 'agency',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/agency/agency.routes').then((m) => m.agencyRoutes),
      },
      {
        path: 'studio',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/studio/studio.routes').then((m) => m.studioRoutes),
      },
      {
        path: 'projects',
        canActivate: [authGuard],
        loadChildren: () =>
          import('@modules/projects/projects.routes').then((m) => m.projectsRoutes),
      },
      {
        path: 'resources',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/library/library.routes').then((m) => m.libraryRoutes),
      },
      {
        path: 'my-generations',
        canActivate: [authGuard],
        loadChildren: () =>
          import('@modules/agency/agency.routes').then((m) => m.myGenerationsRoutes),
      },
      {
        path: 'admin',
        canActivate: [authGuard, superadminGuard],
        loadChildren: () => import('@modules/admin/admin.routes').then((m) => m.adminRoutes),
      },
      {
        // "Tu GPU": emparejar las máquinas con GPU del equipo (admin del
        // tenant, role_level ≤ 1 — el guard vive en el módulo).
        path: 'gpu',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/gpu/gpu.routes').then((m) => m.gpuRoutes),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '/studio',
  },
];
