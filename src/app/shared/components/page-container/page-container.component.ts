import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-container',
  templateUrl: './page-container.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageContainerComponent {
  readonly title = input<string>();
}
