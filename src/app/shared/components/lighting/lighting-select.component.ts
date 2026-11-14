import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { LIGHTING_TEMPLATES, LightingTemplate } from './lighting-templates';

interface LightingCard {
  id: string;
  name: string;
  thumb: string;
  description: string;
}

type LightingSort = 'original' | 'name';

/**
 * Selector de iluminación / dirección de arte. Se muestra como un campo con
 * vista previa y abre un modal con todos los esquemas, búsqueda, orden y
 * restablecer. En modo compacto (una luz por toma) abre el mismo modal.
 */
@Component({
  selector: 'app-lighting-select',
  imports: [FormsModule, Dialog, InputText, Select, TranslatePipe],
  templateUrl: './lighting-select.component.html',
  styleUrl: './lighting-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightingSelectComponent {
  private readonly translate = inject(TranslateService);

  readonly inputId = input('lightingTemplate');
  readonly value = input<string | null>(null);
  /** Sin etiqueta ni ayuda: se usa dentro de la fila de una toma. */
  readonly compact = input(false);
  /** Formato píldora compacta para barras de configuración. */
  readonly pill = input(false);
  readonly valueChange = output<string | null>();

  protected readonly dialogOpen = signal(false);
  protected readonly query = signal('');
  protected readonly sort = signal<LightingSort>('original');

  protected readonly cards = computed<LightingCard[]>(() => {
    const isEnglish = this.translate.currentLang()?.startsWith('en') === true;
    return LIGHTING_TEMPLATES.map((template) => this.toCard(template, isEnglish));
  });

  protected readonly filteredCards = computed<LightingCard[]>(() => {
    const term = this.query().trim().toLowerCase();
    const cards = term
      ? this.cards().filter(
          (card) =>
            card.name.toLowerCase().includes(term) ||
            card.description.toLowerCase().includes(term),
        )
      : [...this.cards()];
    if (this.sort() === 'name') {
      cards.sort((a, b) => a.name.localeCompare(b.name));
    }
    return cards;
  });

  protected readonly selected = computed(() => {
    const id = this.value();
    return id ? this.cards().find((card) => card.id === id) ?? null : null;
  });

  protected readonly sortOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('LIGHTING.SORT_ORIGINAL'), value: 'original' as LightingSort },
      { label: this.translate.instant('LIGHTING.SORT_NAME'), value: 'name' as LightingSort },
    ];
  });

  protected openPicker(): void {
    this.query.set('');
    this.dialogOpen.set(true);
  }

  protected choose(value: string | null): void {
    this.valueChange.emit(value);
    this.dialogOpen.set(false);
  }

  protected reset(): void {
    this.valueChange.emit(null);
  }

  private toCard(template: LightingTemplate, isEnglish: boolean): LightingCard {
    return {
      id: template.id,
      name: template.name,
      thumb: template.thumb,
      description: isEnglish ? template.descriptionEn : template.descriptionEs,
    };
  }
}
