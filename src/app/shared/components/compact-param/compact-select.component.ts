import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Popover } from 'primeng/popover';

export interface CompactOption {
  label: string;
  value: string | number;
}

/** Chip compacto que abre un popover de opciones (sin campos largos). */
@Component({
  selector: 'app-compact-select',
  imports: [Popover],
  templateUrl: './compact-select.component.html',
  styleUrl: './compact-param.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompactSelectComponent {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly options = input<readonly CompactOption[]>([]);
  readonly valueChange = output<string | number>();

  protected readonly selectedLabel = computed(
    () => this.options().find((option) => option.value === this.value())?.label ?? '',
  );

  protected choose(value: string | number, popover: Popover): void {
    this.valueChange.emit(value);
    popover.hide();
  }
}
