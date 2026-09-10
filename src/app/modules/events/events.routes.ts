import { Routes } from '@angular/router';

export const eventsRoutes: Routes = [
  {
    path: '',
    title: 'Eventos',
    loadComponent: () => import('./ui/events/events.component').then((m) => m.EventsComponent),
  },
];
