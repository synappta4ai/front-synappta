import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-container',
  templateUrl: './page-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageContainerComponent {
  readonly title = input<string>();
  /** Ancho completo: VideoMachine necesita todo el ancho para no scrollear. */
  readonly wide = input(false);
}
