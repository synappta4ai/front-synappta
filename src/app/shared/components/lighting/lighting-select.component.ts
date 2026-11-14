import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Select } from 'primeng/select';

import { LIGHTING_TEMPLATES } from './lighting-templates';

interface LightingOption {
  label: string;
  value: string;
  thumb: string | null;
  description: string;
}

interface LightingCard {
  id: string;
  name: string;
  thumb: string;
  description: string;
}

/**
 * Selector compartido de iluminación / dirección de arte. En modo normal se
 * muestra como tarjetas con la imagen del esquema; en modo compacto (una luz
 * por toma) es un desplegable con la miniatura.
 */
@Component({
  selector: 'app-lighting-select',
  imports: [FormsModule, Select, TranslatePipe],
  templateUrl: './lighting-select.component.html',
  styleUrl: './lighting-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightingSelectComponent {
  private readonly translate = inject(TranslateService);

  readonly inputId = input('lightingTemplate');
  readonly value = input<string | null>(null);
  /** Sin tarjetas: desplegable compacto para la fila de una toma. */
  readonly compact = input(false);
  readonly valueChange = output<string | null>();

  protected readonly cards = computed<LightingCard[]>(() => {
    const isEnglish = this.translate.currentLang()?.startsWith('en') === true;
    return LIGHTING_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      thumb: template.thumb,
      description: isEnglish ? template.descriptionEn : template.descriptionEs,
    }));
  });

  protected readonly options = computed<LightingOption[]>(() => {
    const isEnglish = this.translate.currentLang()?.startsWith('en') === true;
    return [
      {
        label: this.translate.instant('LIGHTING.AUTO'),
        value: '',
        thumb: null,
        description: this.translate.instant('LIGHTING.AUTO_HINT'),
      },
      ...LIGHTING_TEMPLATES.map((template) => ({
        label: template.name,
        value: template.id,
        thumb: template.thumb,
        description: isEnglish ? template.descriptionEn : template.descriptionEs,
      })),
    ];
  });

  protected onChange(value: string | null): void {
    this.valueChange.emit(value ? value : null);
  }
}
