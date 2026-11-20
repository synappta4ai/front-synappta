import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';

import { SelectScrollGuardService } from '@services/select-scroll-guard.service';
import { TooltipViewportGuardService } from '@services/tooltip-viewport-guard.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('front-synapta');

  constructor() {
    // Guards globales de UI: se instancian una sola vez en el root.
    inject(SelectScrollGuardService);
    inject(TooltipViewportGuardService);
  }
}
