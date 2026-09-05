import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Service {
  title: string;
  description: string;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly services: readonly Service[] = [
    {
      title: 'Producción de video',
      description: 'Ideamos, grabamos y editamos piezas para cualquier formato y plataforma.',
    },
    {
      title: 'Estrategia de contenido',
      description:
        'Planificamos calendarios y formatos que mantienen tu marca presente todo el año.',
    },
    {
      title: 'Campañas de marca',
      description:
        'Conceptos visuales y activaciones que hacen que tu mensaje no pase desapercibido.',
    },
  ];
}
