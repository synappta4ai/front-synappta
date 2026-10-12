import { Routes } from '@angular/router';

export const videoRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.VIDEO',
    loadComponent: () => import('./ui/video/video.component').then((m) => m.VideoComponent),
  },
];
