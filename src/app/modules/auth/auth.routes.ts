import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: 'login',
    title: 'APP.ROUTES.LOGIN',
    loadComponent: () => import('./ui/auth/auth.component').then((m) => m.AuthComponent),
  },
];
