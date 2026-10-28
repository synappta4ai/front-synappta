import { Routes } from '@angular/router';

export const studioRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.STUDIO',
    loadComponent: () => import('./ui/studio/studio.component').then((m) => m.StudioComponent),
  },
  {
    path: 'events',
    title: 'APP.ROUTES.GENERATION_EVENTS',
    loadComponent: () =>
      import('./ui/generation-events/generation-events.component').then(
        (m) => m.GenerationEventsComponent,
      ),
  },
];
