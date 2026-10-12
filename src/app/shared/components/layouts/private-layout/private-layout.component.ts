import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { NgxUiLoaderModule, NgxUiLoaderService } from 'ngx-ui-loader';

import { NavBarComponent } from '@shared/components/nav-bar/nav-bar.component';

const ROUTE_LOADER_TASK = 'private-route';

@Component({
  selector: 'app-private-layout',
  imports: [RouterOutlet, NavBarComponent, NgxUiLoaderModule],
  templateUrl: './private-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivateLayoutComponent implements OnInit {
  private readonly loader = inject(NgxUiLoaderService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loader.start(ROUTE_LOADER_TASK, { delay: 120, minTime: 300 });
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loader.stop(ROUTE_LOADER_TASK);
      }
    });
  }
}
