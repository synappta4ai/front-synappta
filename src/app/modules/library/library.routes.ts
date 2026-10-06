import { Routes } from '@angular/router';

export const libraryRoutes: Routes = [
  {
    path: '',
    title: 'Recursos',
    loadComponent: () =>
      import('./ui/resources/resources.component').then((m) => m.ResourcesComponent),
  },
];
