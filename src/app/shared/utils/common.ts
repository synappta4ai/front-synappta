import { FormGroup } from '@angular/forms';

export function selfXSSWarning() {
  setTimeout(() => {
    console.log(
      '%c** STOP **',
      'font-weight:bold; font: 2.5em Arial; color: white; background-color: #e11d48; padding-left: 15px; padding-right: 15px; border-radius: 25px; padding-top: 5px; padding-bottom: 5px;',
    );
    console.log(
      `\n%cThis is a browser feature intended for developers. Using this console may allow attackers to impersonate you and steal your information sing an attack called Self-XSS. Do not enter or paste code that you do not understand.`,
      'font-weight:bold; font: 2em Arial; color: #e11d48;',
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
