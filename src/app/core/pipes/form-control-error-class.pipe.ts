import { Pipe, PipeTransform } from '@angular/core'
import { AbstractControl } from '@angular/forms'

@Pipe({
  name: 'formControlErrorClass',
  pure: false,
  standalone: true,
})
export class FormControlErrorClassPipe implements PipeTransform {
  transform(
    control: AbstractControl<unknown, unknown> | null,
    classError: string = 'ng-invalid ng-dirty'
  ): string {
    const existErrorAndTouched = control?.touched && control?.invalid
    if (existErrorAndTouched) {
      return classError
    }
    return ''
  }
}
