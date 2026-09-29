import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'upperCaseAndLenLimit',
  standalone: true,
})
export class UpperCaseAndLenLimitPipe implements PipeTransform {
  transform(value: string, length: number = 45): string {
    const uppercase = value.toUpperCase();
    if (uppercase.length > length) {
      return uppercase.substring(0, length) + '...';
    }
    return uppercase;
  }
}
