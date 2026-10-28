import { Routes } from '@angular/router';

export const editorRoutes: Routes = [
  {
    path: '',
    title: 'APP.ROUTES.EDITOR',
    loadComponent: () => import('./ui/editor/editor.component').then((m) => m.EditorComponent),
  },
];
