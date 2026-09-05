import { Routes } from '@angular/router';

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
        loadChildren: () => import('@modules/agency/agency.routes').then((m) => m.agencyRoutes),
      },
      {
        path: 'video',
        loadChildren: () => import('@modules/video/video.routes').then((m) => m.videoRoutes),
      },
    ],
  },
];
