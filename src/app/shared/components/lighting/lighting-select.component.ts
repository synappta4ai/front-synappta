import { NgTemplateOutlet } from '@angular/common';
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

import {
  DEFAULT_LOOK_INTENSITY,
  LIGHTING_TEMPLATES,
  LightingTemplate,
  LookIntensity,
} from './lighting-templates';

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
  imports: [FormsModule, Dialog, InputText, NgTemplateOutlet, Select, TranslatePipe],
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
  /** El usuario ya eligió un preset (no está en Auto). */
  readonly configured = input(false);
  /** Falta elegir este preset para poder continuar. */
  readonly attention = input(false);
  /** Intensidad elegida del look (por defecto Media). */
  readonly intensity = input<LookIntensity>(DEFAULT_LOOK_INTENSITY);
  /** Muestra la intensidad dentro de la píldora (si no, solo en el modal). */
  readonly intensityInline = input(true);
  readonly valueChange = output<string | null>();
  readonly intensityChange = output<LookIntensity>();

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
            card.name.toLowerCase().includes(term) || card.description.toLowerCase().includes(term),
        )
      : [...this.cards()];
    if (this.sort() === 'name') {
      cards.sort((a, b) => a.name.localeCompare(b.name));
    }
    return cards;
  });

  protected readonly selected = computed(() => {
    const id = this.value();
    return id ? (this.cards().find((card) => card.id === id) ?? null) : null;
  });

  protected readonly sortOptions = computed(() => {
    this.translate.currentLang();
    return [
      {
        label: this.translate.instant('LIGHTING.SORT_ORIGINAL'),
        value: 'original' as LightingSort,
      },
      { label: this.translate.instant('LIGHTING.SORT_NAME'), value: 'name' as LightingSort },
    ];
  });

  protected readonly intensityOptions = computed(() => {
    this.translate.currentLang();
    return [
      {
        label: this.translate.instant('LIGHTING.INTENSITY_SUBTLE'),
        short: this.translate.instant('LIGHTING.INTENSITY_SUBTLE_SHORT'),
        hint: this.translate.instant('LIGHTING.INTENSITY_SUBTLE_HINT'),
        value: 'subtle' as LookIntensity,
      },
      {
        label: this.translate.instant('LIGHTING.INTENSITY_MEDIUM'),
        short: this.translate.instant('LIGHTING.INTENSITY_MEDIUM_SHORT'),
        hint: this.translate.instant('LIGHTING.INTENSITY_MEDIUM_HINT'),
        value: 'medium' as LookIntensity,
      },
      {
        label: this.translate.instant('LIGHTING.INTENSITY_STRONG'),
        short: this.translate.instant('LIGHTING.INTENSITY_STRONG_SHORT'),
        hint: this.translate.instant('LIGHTING.INTENSITY_STRONG_HINT'),
        value: 'strong' as LookIntensity,
      },
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

  protected setIntensity(value: LookIntensity): void {
    this.intensityChange.emit(value);
  }

  /** Miniatura faltante: cae al placeholder sin romper la tarjeta. */
  protected onThumbError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img || img.dataset['fallback'] === '1') {
      return;
    }
    img.dataset['fallback'] = '1';
    img.src = '/assets/lighting/_placeholder.svg';
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
