import { Routes } from '@angular/router';

import { PoseSheetComponent } from './ui/pose-sheet/pose-sheet.component';

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
    path: '',
    pathMatch: 'full',
    redirectTo: 'pose-sheet',
  },
];
