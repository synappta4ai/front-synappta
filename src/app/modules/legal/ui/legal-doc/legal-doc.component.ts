import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export interface LegalSection {
  readonly titleKey: string;
  readonly bodyKey: string;
}

/**
 * Hoja de documento legal: título, fecha de vigencia y secciones.
 * El contenido vive en i18n (LEGAL.*) en ambos idiomas.
 */
@Component({
  selector: 'legal-doc',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './legal-doc.component.html',
  styleUrl: './legal-doc.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalDocComponent {
  readonly titleKey = input.required<string>();
  readonly updatedKey = input.required<string>();
  readonly sections = input.required<readonly LegalSection[]>();
}
