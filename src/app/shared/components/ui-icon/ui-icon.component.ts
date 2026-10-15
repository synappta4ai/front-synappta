import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Icono decorativo del subset local Material Icons (ver `.md-*` en styles.css).
 * Siempre `aria-hidden`: el texto accesible lo pone el padre (aria-label del botón).
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<i [class]="classes()" aria-hidden="true"></i>`,
  styles: [':host{display:contents}'],
})
export class UiIcon {
  readonly name = input.required<string>();
  readonly classes = computed(() => `md ${this.name()}`);
}
