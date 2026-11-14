import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Popover } from 'primeng/popover';

/** Chip compacto con un input numérico dentro del popover. */
@Component({
  selector: 'app-compact-number',
  imports: [Popover],
  templateUrl: './compact-number.component.html',
  styleUrl: './compact-param.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompactNumberComponent {
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('numberInput');

  readonly label = input('');
  readonly value = input<number | null>(null);
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly step = input(1);
  readonly suffix = input('');
  readonly placeholder = input('Auto');
  readonly valueChange = output<number | null>();

  protected readonly display = computed(() => {
    const value = this.value();
    return value === null || value === undefined ? this.placeholder() : `${value}${this.suffix()}`;
  });

  protected focusInput(): void {
    const element = this.input()?.nativeElement;
    if (!element) return;
    setTimeout(() => {
      element.focus();
      element.select();
    }, 0);
  }

  protected onInput(event: Event): void {
    this.emit((event.target as HTMLInputElement).value);
  }

  protected bump(delta: number): void {
    const current = this.value() ?? this.min() ?? 0;
    this.emit(String(current + delta * this.step()));
  }

  private emit(raw: string): void {
    if (raw.trim() === '') {
      this.valueChange.emit(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    let value = parsed;
    const min = this.min();
    const max = this.max();
    if (min !== null) value = Math.max(min, value);
    if (max !== null) value = Math.min(max, value);
    this.valueChange.emit(value);
  }
}
