import { Routes } from '@angular/router';

import { AgencyComponent } from './ui/agency/agency.component';

export const agencyRoutes: Routes = [{ path: '', title: 'Agency', component: AgencyComponent }];

export const myGenerationsRoutes: Routes = [
  {
    path: '',
    title: 'Mis generaciones',
    loadComponent: () =>
      import('./ui/my-generations/my-generations.component').then(
        (m) => m.MyGenerationsComponent,
      ),
  },
];
