import { Routes } from '@angular/router';

export const videoRoutes: Routes = [
  {
    path: '',
    title: 'Video',
    loadComponent: () => import('./ui/video/video.component').then((m) => m.VideoComponent),
  },
];
