import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // El editor usa <video>/<audio> y APIs del navegador: se renderiza solo en
    // el cliente. Debe ir antes del comodín (gana la primera coincidencia).
    path: 'tools/editor',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
