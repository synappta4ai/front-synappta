import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

interface CustomError {
  type: string;
  message: string;
}

/**
 * Componente para mostrar errores de validación
 *
 * @example Ejemplo Basico
 * ```html
 * <validator-errors
 *   [control]="frm.get('name')"
 *   [label]="'forms.name.label' | translate"
 *   [submitTick]="submitted()"
 * />
 * ```
 *
 * @example Ejemplo Completo
 * ```html
 * <validator-errors
 *   [control]="frm.get('name')"
 *   [label]="'forms.name.label' | translate"
 *   [submitTick]="submitted()"
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './validator-errors.component.html',
})
export class ValidatorErrors {
  readonly control = input<AbstractControl | null>(null);
  readonly label = input<string>('');
  readonly maxlength = input<string>('');
  readonly minlength = input<string>('');
  readonly pattern = input<string>('');
  readonly required = input<string>('');
  readonly min = input<string>('');
  readonly max = input<string>('');
  readonly email = input<string>('');
  readonly unique = input<string>('');
  readonly omitErrors = input<string[]>([]);
  readonly customErrors = input<CustomError[]>([]);
  readonly customErrorType = input<string>('');
  readonly customErrorMessage = input<string>('');
  /** Aumentar tras `markAllAsTouched()` en el submit para re-evaluar el estado del control */
  readonly submitTick = input(0);

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

  private readonly _tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const ctrl = this.control();
      if (!ctrl) return;

      const sub = ctrl.events.subscribe(() => {
        this._tick.update((v) => v + 1);
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  readonly errorKey = computed(() => {
    this.submitTick();
    this._tick();
    const ctrl = this.control();
    if (!ctrl || !ctrl.errors) return null;
    if (ctrl.untouched) return null;
    return Object.keys(ctrl.errors)[0] ?? null;
  });

  readonly errorParams = computed(() => {
    const key = this.errorKey();
    const ctrl = this.control();
    const errors = ctrl?.errors ?? {};

    if (key === 'min')
      return { control: this.label(), value: (errors['min'] as { min: number }).min };
    if (key === 'max')
      return { control: this.label(), value: (errors['max'] as { max: number }).max };
    if (key === 'maxlength')
      return {
        control: this.label(),
        value: (errors['maxlength'] as { requiredLength: number }).requiredLength,
      };
    if (key === 'minlength')
      return {
        control: this.label(),
        value: (errors['minlength'] as { requiredLength: number }).requiredLength,
      };
    return { control: this.label() };
  });
}
