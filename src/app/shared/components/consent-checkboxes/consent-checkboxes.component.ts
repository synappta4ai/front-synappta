import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { Checkbox } from 'primeng/checkbox';

/**
 * Dos casillas separadas de aceptación legal (Ley 1581/2012: autorización
 * previa, expresa e informada por documento). Cada una enlaza su documento.
 */
@Component({
  selector: 'consent-checkboxes',
  imports: [FormsModule, RouterLink, Checkbox, TranslatePipe],
  templateUrl: './consent-checkboxes.component.html',
  styleUrl: './consent-checkboxes.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentCheckboxesComponent {
  readonly terms = model(false);
  readonly privacy = model(false);
  /** Tick de submit del padre: muestra el error si falta alguna aceptación. */
  readonly submitTick = input(0);
  /** Prefijo de ids (por si el componente aparece dos veces en la página). */
  readonly idPrefix = input('consent');

  protected readonly showError = computed(
    () => this.submitTick() > 0 && !(this.terms() && this.privacy()),
  );
}
