import { Routes } from '@angular/router';

export const studioRoutes: Routes = [
  {
    path: '',
    title: 'Studio',
    loadComponent: () => import('./ui/studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'events',
    title: 'Eventos de generación',
    loadComponent: () =>
      import('./ui/generation-events/generation-events.component').then(
        (m) => m.GenerationEventsComponent,
      ),
  },
];
