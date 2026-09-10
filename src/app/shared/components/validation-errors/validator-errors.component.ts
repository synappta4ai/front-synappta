import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

interface CustomError {
  type: string;
  message: string;
}

interface ErrorParams {
  control: string;
  value?: unknown;
}

/**
 * Componente para mostrar errores de validación
 *
 * @example Ejemplo Basico
 * ```html
 * <validator-errors
 *   [control]="frm.get('name')"
 *   [label]="'forms.name.label' | translate"
 * />
 * ```
 *
 * @example Ejemplo Completo
 * ```html
 * <validator-errors
 *   [control]="frm.get('name')"
 *   [label]="'forms.name.label' | translate"
 *   [required]="'forms.name.error1' | translate"
 *   [maxlength]="'forms.name.error2' | translate"
 *   [minlength]="'forms.name.error3' | translate"
 *   [pattern]="'forms.name.error4' | translate"
 *   [email]="'forms.name.error5' | translate"
 *   [min]="'forms.name.error6' | translate"
 *   [max]="'forms.name.error7' | translate"
 *   [unique]="'forms.name.error8' | translate"
 *   [omitErrors]="['required']"
 *   [customErrors]="[{ type: 'custom', message: 'forms.name.error9' }]"
 *   [customErrorType]="'custom'"
 *   [customErrorMessage]="'forms.name.error10'"
 * />
 * ```
 */
@Component({
  selector: 'validator-errors',
  imports: [TranslatePipe],
  templateUrl: './validator-errors.component.html',
})
export class ValidatorErrors {
  /** Control del formulario `[control]="frm.get('name')"` */
  readonly control = input<AbstractControl | null>(null);
  /** La nombre del campo preferiblemente traducido (label): `[label]="'forms.name.label' | translate"` */
  readonly label = input<string>('');
  /** Personalizacion del error `maxlength` */
  readonly maxlength = input<string>('');
  /** Personalizacion del error `minlength` */
  readonly minlength = input<string>('');
  /** Personalizacion del error `pattern` */
  readonly pattern = input<string>('');
  /** Personalizacion del error `required` - `required="forms.name.error1"` */
  readonly required = input<string>('');
  /** Personalizacion del error `min` */
  readonly min = input<string>('');
  /** Personalizacion del error `max` */
  readonly max = input<string>('');
  /** Personalizacion del error `email` */
  readonly email = input<string>('');
  /** Personalizacion del error `unique` */
  readonly unique = input<string>('');
  /** Se omiten los errores que este en esta lista */
  readonly omitErrors = input<string[]>([]);
  /** Se pueden agregar errores custom */
  readonly customErrors = input<CustomError[]>([]);
  /** Se agrega un error custom */
  readonly customErrorType = input<string>('');
  /** Se agrega el mensaje de un error custom */
  readonly customErrorMessage = input<string>('');

  readonly errorsDefault = [
    'required',
    'maxlength',
    'minlength',
    'pattern',
    'email',
    'min',
    'max',
    'unique',
  ];

  get errorKey(): string | null {
    if (!this.control() || !this.control()?.errors) return null;
    if (this.control()?.untouched) return null;
    // Obtiene el primer error
    return Object.keys(this.control()?.errors || {})[0];
  }

  /**
   * Getter de los errores de la validacion
   */
  get errorParams(): {
    control: string;
    value?: unknown;
  } {
    const errors = this.control()?.errors || {};
    if (!errors) return { control: this.label() };
    if (this.errorKey === 'min') return { control: this.label(), value: errors['min'].min };
    if (this.errorKey === 'max') return { control: this.label(), value: errors['max'].max };
    if (this.errorKey === 'maxlength')
      return { control: this.label(), value: errors['maxlength'].requiredLength };
    if (this.errorKey === 'minlength')
      return { control: this.label(), value: errors['minlength'].requiredLength };
    return { control: this.label() };
  }
}
