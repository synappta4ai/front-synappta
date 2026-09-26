import { Routes } from '@angular/router';

import { authGuard } from '@guards/auth.guard';
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
        path: 'video',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/video/video.routes').then((m) => m.videoRoutes),
      },
      {
        // /events muestra los eventos de generación; el CRUD de eventos
        // (proyectos de agencia) vive en /events/manage.
        path: 'events',
        canActivate: [authGuard],
        children: [
          {
            path: '',
            title: 'Eventos de generación',
            loadComponent: () =>
              import('@modules/studio/ui/generation-events/generation-events.component').then(
                (m) => m.GenerationEventsComponent,
              ),
          },
          {
            path: 'manage',
            title: 'Eventos',
            loadChildren: () => import('@modules/events/events.routes').then((m) => m.eventsRoutes),
          },
        ],
      },
      {
        path: 'projects',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/projects/projects.routes').then((m) => m.projectsRoutes),
      },
      {
        path: 'admin',
        canActivate: [authGuard],
        loadChildren: () => import('@modules/admin/admin.routes').then((m) => m.adminRoutes),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '/agency',
  },
];
