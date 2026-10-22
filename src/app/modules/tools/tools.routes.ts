import { Routes } from '@angular/router';

import { LocationComponent } from './ui/location/location.component';
import { PoseSheetComponent } from './ui/pose-sheet/pose-sheet.component';
import { StoryboardComponent } from './ui/storyboard/storyboard.component';

/**
 * Herramientas del cliente. Rutas abiertas a cualquier usuario autenticado
 * (el guard de tenant-admin NO aplica: son herramientas de uso, no de admin).
 */
export const toolsRoutes: Routes = [
  {
    path: 'pose-sheet',
    component: PoseSheetComponent,
  },
  {
    path: 'location',
    component: LocationComponent,
  },
  {
    path: 'storyboard',
    component: StoryboardComponent,
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'pose-sheet',
  },
];
