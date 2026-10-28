import { Routes } from '@angular/router';

export const projectsRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.PROJECTS',
    loadComponent: () =>
      import('./ui/projects/projects.component').then((m) => m.ProjectsComponent),
  },
];
