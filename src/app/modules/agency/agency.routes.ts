import { Routes } from '@angular/router';

import { AgencyComponent } from './ui/agency/agency.component';

export const agencyRoutes: Routes = [
  { path: '', title: 'APP.ROUTES.AGENCY', component: AgencyComponent },
];

export const myGenerationsRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.MY_GENERATIONS',
    loadComponent: () =>
      import('./ui/my-generations/my-generations.component').then((m) => m.MyGenerationsComponent),
  },
];
