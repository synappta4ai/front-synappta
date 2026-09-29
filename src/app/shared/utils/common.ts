import { FormGroup } from '@angular/forms';

export function selfXSSWarning() {
  setTimeout(() => {
    console.log('%c** STOP **', 'font-weight:bold; font-size: 2.5em; padding: 5px 15px;');
    console.log(
      `\n%cThis is a browser feature intended for developers. Using this console may allow attackers to impersonate you and steal your information sing an attack called Self-XSS. Do not enter or paste code that you do not understand.`,
      'font-weight:bold; font-size: 2em;',
    );
  });
}

/**
 * Optiene los errores de un formulario con los nombres de los campos
 * @param form FormGroup to get errors from
 * @returns Array of errors
 */
export function getFormErrors(form: FormGroup) {
  return Object.entries(form.controls)
    .map(([key, control]) => {
      if (control.errors) {
        return { [key]: control.errors };
      }
      return null;
    })
    .filter((error) => error !== null);
}
