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

import { CAMERA_MOVEMENTS, CameraMovement } from './camera-movements';

type CameraSort = 'original' | 'name';
type CameraTab = 'config' | 'movement';
type PreviewState = 'mp4' | 'gif' | 'none';

/**
 * Selector de movimientos de cámara. El campo abre un modal con todos los
 * movimientos de `camera movement.md`; se pueden combinar varios por toma y
 * el orden se conserva en el prompt.
 */
@Component({
  selector: 'app-camera-movement-select',
  imports: [FormsModule, Dialog, InputText, Select, TranslatePipe],
  templateUrl: './camera-movement-select.component.html',
  styleUrl: './camera-movement-select.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraMovementSelectComponent {
  private readonly translate = inject(TranslateService);

  readonly inputId = input('cameraMovement');
  readonly value = input<readonly string[]>([]);
  readonly compact = input(false);
  /** Formato píldora compacta para barras de configuración. */
  readonly pill = input(false);
  readonly valueChange = output<string[]>();

  protected readonly dialogOpen = signal(false);
  protected readonly tab = signal<CameraTab>('movement');
  protected readonly query = signal('');
  protected readonly sort = signal<CameraSort>('original');

  protected readonly movements = CAMERA_MOVEMENTS;

  protected readonly filtered = computed<CameraMovement[]>(() => {
    const term = this.query().trim().toLowerCase();
    const list = term
      ? CAMERA_MOVEMENTS.filter(
          (movement) =>
            movement.name.toLowerCase().includes(term) ||
            movement.family.toLowerCase().includes(term) ||
            movement.prompt.toLowerCase().includes(term),
        )
      : [...CAMERA_MOVEMENTS];
    if (this.sort() === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  });

  protected readonly selectedNames = computed(() =>
    this.value()
      .map((id) => CAMERA_MOVEMENTS.find((movement) => movement.id === id)?.name)
      .filter((name): name is string => !!name),
  );

  protected readonly sortOptions = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('CAMERA.SORT_ORIGINAL'), value: 'original' as CameraSort },
      { label: this.translate.instant('CAMERA.SORT_NAME'), value: 'name' as CameraSort },
    ];
  });

  protected openPicker(): void {
    this.query.set('');
    this.tab.set('movement');
    this.dialogOpen.set(true);
  }

  protected toggle(id: string): void {
    const current = this.value();
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    this.valueChange.emit(next);
  }

  protected isSelected(id: string): boolean {
    return this.value().includes(id);
  }

  protected orderOf(id: string): number {
    return this.value().indexOf(id) + 1;
  }

  protected reset(): void {
    this.valueChange.emit([]);
  }

  protected readonly previewStates = signal<Record<string, PreviewState>>({});

  protected previewState(id: string): PreviewState {
    return this.previewStates()[id] ?? 'mp4';
  }

  protected previewUrl(id: string, ext: 'mp4' | 'gif'): string {
    return `/assets/camera/${id}.${ext}`;
  }

  protected onPreviewError(id: string, ext: 'mp4' | 'gif'): void {
    this.previewStates.update((map) => ({
      ...map,
      [id]: ext === 'mp4' ? 'gif' : 'none',
    }));
  }
}