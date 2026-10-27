import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';

import { DevicePushService } from '@core/services/device-push.service';

/**
 * Página pública /pair?code=…: se abre al escanear el QR de vinculación y
 * suscribe el push de este dispositivo a la cuenta que generó el código.
 */
@Component({
  selector: 'app-pair-device',
  imports: [RouterLink, Button, TranslatePipe],
  templateUrl: './pair-device.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PairDeviceComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  protected readonly devicePush = inject(DevicePushService);

  protected readonly code = signal<string | null>(
    this.route.snapshot.queryParamMap.get('code'),
  );
  protected readonly done = signal(false);

  protected async activate(): Promise<void> {
    const code = this.code();
    if (!code || this.devicePush.busy()) {
      return;
    }
    if (await this.devicePush.redeemPairing(code)) {
      this.done.set(true);
    }
  }

  protected errorMessage(): string | null {
    const key = this.devicePush.error();
    return key ? this.translate.instant(key) : null;
  }
}
