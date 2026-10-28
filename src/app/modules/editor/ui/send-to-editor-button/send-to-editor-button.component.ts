import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { EditorClipInput } from '../../interfaces';
import { EditorTransferService } from '../../services';

/**
 * Botón "Enviar al editor": deja el clip en el buzón del editor y navega a él.
 * Es un componente hijo mínimo para poder añadirlo a Studio o a la biblioteca
 * con una sola línea de template, sin inyectar nada nuevo en esas pantallas.
 *
 * `quick` lo dibuja como el botón flotante de las tarjetas de la biblioteca
 * (junto al de descarga) y lo revela al pasar el cursor por la tarjeta.
 */
@Component({
  selector: 'app-send-to-editor-button',
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [class.quick]="quick()"
      [title]="'EDITOR.SEND_TO_EDITOR' | translate"
      [attr.aria-label]="'EDITOR.SEND_TO_EDITOR' | translate"
      (click)="send($event)"
    >
      <i class="md md-movie" aria-hidden="true"></i>
      @if (showLabel()) {
        <span>{{ 'EDITOR.SEND_SHORT' | translate }}</span>
      }
    </button>
  `,
  styles: `
    .quick {
      position: absolute;
      top: 8px;
      right: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 50%;
      background: rgba(6, 16, 28, 0.78);
      color: var(--color-ink-on-dark);
      cursor: pointer;
      opacity: 0;
      transform: translateY(-4px);
      transition:
        opacity 0.15s ease,
        transform 0.15s ease;
    }

    :host-context(.resource-card:hover) .quick,
    :host-context(.resource-card:focus-within) .quick,
    .quick:focus-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .quick:hover {
      color: var(--color-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class SendToEditorButtonComponent {
  private readonly transfer = inject(EditorTransferService);
  private readonly router = inject(Router);

  readonly clip = input.required<EditorClipInput>();
  /** Clases del <button> (p. ej. `rating-redo` en Studio). */
  readonly buttonClass = input('');
  readonly showLabel = input(true);
  readonly quick = input(false);

  protected send(event: Event): void {
    event.stopPropagation();
    this.transfer.send(this.clip());
    void this.router.navigate(['/tools/editor']);
  }
}
