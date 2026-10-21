import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { AiModel, CredentialProvider, Modality } from '../../interfaces';
import { ModelCatalogService } from '../../services';

/** Estado de carga del catálogo que alimenta el desplegable. */
type CatalogState =
  | { readonly status: 'loading'; readonly models: readonly AiModel[] }
  | { readonly status: 'error'; readonly models: readonly AiModel[] }
  | { readonly status: 'ready'; readonly models: readonly AiModel[] };

const LOADING: CatalogState = { status: 'loading', models: [] };

/**
 * Selector de modelos del catálogo, reusable y por modalidad.
 *
 * Se le dice qué listar por props: `modality` acepta una modalidad o varias
 * (texto, voz, imagen, video) y, si hace falta, se acota con `ratio`,
 * `provider` o `names`. El catálogo sale de `ModelCatalogService`, memorizado
 * por modalidad: dos selectores de la misma pantalla (p. ej. texto + imagen)
 * comparten una sola petición.
 *
 * El valor es el `name` del modelo (sirve en `ngModel` y en formularios
 * reactivos); `selectionChange` entrega el modelo completo cuando el consumidor
 * necesita sus `defaults`.
 *
 * ```html
 * <app-model-select modality="image" [ratio]="'3:2'" [(ngModel)]="model" />
 * <app-model-select modality="video" formControlName="model" />
 * ```
 */
@Component({
  selector: 'app-model-select',
  imports: [ReactiveFormsModule, TranslatePipe, Select, Tag],
  templateUrl: './model-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ModelSelectComponent),
      multi: true,
    },
  ],
})
export class ModelSelectComponent implements ControlValueAccessor {
  private readonly catalog = inject(ModelCatalogService);
  private readonly destroyRef = inject(DestroyRef);

  /** Modalidad(es) a listar: 'text' | 'audio' | 'image' | 'video'. */
  readonly modality = input<Modality | readonly Modality[]>('image');
  /** Sólo modelos que declaren esta relación de aspecto. */
  readonly ratio = input<string | null>(null);
  /** Sólo modelos de este proveedor de credenciales. */
  readonly provider = input<CredentialProvider | null>(null);
  /** Sólo estos nombres (para herramientas atadas a un modelo concreto). */
  readonly names = input<readonly string[] | null>(null);
  /** Elige el primer modelo cuando el control llega vacío. */
  readonly autoSelect = input(true);
  /** Id del `<select>`, para asociarle un `<label for>`. */
  readonly inputId = input('model-select');
  /** Texto ya traducido; sin valor usa la clave i18n por defecto. */
  readonly placeholder = input<string | null>(null);

  /** Modelo elegido completo (nombre, defaults, proveedor). */
  readonly selectionChange = output<AiModel | null>();

  private readonly modalities = computed<readonly Modality[]>(() => {
    const value = this.modality();
    return typeof value === 'string' ? [value] : [...value];
  });

  protected readonly state = toSignal(
    toObservable(this.modalities).pipe(
      switchMap((modalities) =>
        this.catalog.byModalities(modalities).pipe(
          map((models): CatalogState => ({ status: 'ready', models })),
          startWith(LOADING),
          catchError(() => of<CatalogState>({ status: 'error', models: [] })),
        ),
      ),
    ),
    { initialValue: LOADING },
  );

  /** Control interno: el desplegable habla formularios, el exterior también. */
  protected readonly control = new FormControl<string>('', { nonNullable: true });
  protected readonly value = signal('');

  /** p-select exige un array mutable; el filtro siempre devuelve uno nuevo. */
  protected readonly filtered = computed<AiModel[]>(() => {
    const names = this.names();
    const ratio = this.ratio();
    const provider = this.provider();
    return [...this.state().models].filter(
      (model) =>
        (!names || names.includes(model.name)) &&
        (!ratio || (model.defaults?.ratios ?? []).includes(ratio)) &&
        (!provider || model.credential_provider === provider),
    );
  });

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly failed = computed(() => this.state().status === 'error');
  protected readonly empty = computed(
    () => this.state().status === 'ready' && this.filtered().length === 0,
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((name) => this.commit(name));

    // Mantiene una selección válida: si el valor no está en el catálogo (o
    // llega vacío y `autoSelect` está activo), adopta el primero disponible.
    effect(() => {
      const options = this.filtered();
      if (this.state().status !== 'ready' || options.length === 0) {
        return;
      }
      const current = this.value();
      if (current && options.some((model) => model.name === current)) {
        return;
      }
      if (!current && !this.autoSelect()) {
        return;
      }
      this.control.setValue(options[0]!.name);
    });
  }

  writeValue(value: string | null): void {
    const name = value ?? '';
    this.value.set(name);
    this.control.setValue(name, { emitEvent: false });
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.control.disable({ emitEvent: false });
      return;
    }
    this.control.enable({ emitEvent: false });
  }

  private commit(name: string): void {
    this.value.set(name);
    this.onChange(name);
    this.onTouched();
    this.selectionChange.emit(this.state().models.find((model) => model.name === name) ?? null);
  }
}
