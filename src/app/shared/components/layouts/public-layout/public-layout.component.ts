import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBarComponent } from '@shared/components/nav-bar/nav-bar.component';

@Component({
  selector: 'layout',
  imports: [RouterOutlet, NavBarComponent],
  templateUrl: './public-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
