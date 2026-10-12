import { Routes } from '@angular/router';

export const eventsRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.EVENTS',
    loadComponent: () => import('./ui/events/events.component').then((m) => m.EventsComponent),
  },
];
