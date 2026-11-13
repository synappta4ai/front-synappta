import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Select } from 'primeng/select';

import { LIGHTING_TEMPLATES } from './lighting-templates';

/**
 * Selector compartido de iluminación / dirección de arte. Se usa en cada
 * configuración que dispara generaciones para que el cerebro o el modelo de
 * imagen reciba el esquema de luz elegido.
 */
@Component({
  selector: 'app-lighting-select',
  imports: [FormsModule, Select, TranslatePipe],
  templateUrl: './lighting-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightingSelectComponent {
  private readonly translate = inject(TranslateService);

  readonly inputId = input('lightingTemplate');
  readonly value = input<string | null>(null);
  readonly valueChange = output<string | null>();

  protected readonly options = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('LIGHTING.AUTO'), value: '' },
      ...LIGHTING_TEMPLATES.map((template) => ({ label: template.name, value: template.id })),
    ];
  });

  protected onChange(value: string | null): void {
    this.valueChange.emit(value ? value : null);
  }
}
