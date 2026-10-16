import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize, forkJoin } from 'rxjs';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';

import { LEGAL_DOC_VERSION, LEGAL_DOCS, LegalDocType } from '@constants/legal.constants';
import { AuthService } from '@modules/auth/services/auth.service';

import { ConsentCheckboxesComponent } from '../consent-checkboxes/consent-checkboxes.component';

/**
 * Gate de primer ingreso (bloqueante): si al usuario le falta aceptar los
 * documentos vigentes, no puede usar la app hasta aceptarlos. Cada
 * aceptación queda registrada en el back (quién/cuándo/cómo/versión).
 * Ante un error de red, no bloquea (fail-open).
 */
@Component({
  selector: 'consent-gate',
  imports: [Button, Dialog, Message, TranslatePipe, ConsentCheckboxesComponent],
  templateUrl: './consent-gate.component.html',
  styleUrl: './consent-gate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentGateComponent {
  private readonly authService = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly visible = signal(false);
  protected readonly terms = signal(false);
  protected readonly privacy = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitTick = signal(0);
  protected readonly error = signal<string | null>(null);
  private missing: LegalDocType[] = [];

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.authService
      .listMyConsents()
      .pipe(catchError(() => EMPTY))
      .subscribe((consents) => {
        const accepted = new Set(
          (consents ?? [])
            .filter((c) => c.doc_version === LEGAL_DOC_VERSION)
            .map((c) => c.doc_type),
        );
        this.missing = LEGAL_DOCS.filter((doc) => !accepted.has(doc));
        // Preseleccionar lo ya aceptado (p. ej. terms sí, privacy no).
        this.terms.set(accepted.has('terms'));
        this.privacy.set(accepted.has('privacy'));
        this.visible.set(this.missing.length > 0);
      });
  }

  protected accept(): void {
    this.submitTick.update((v) => v + 1);
    if (!(this.terms() && this.privacy()) || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    forkJoin(
      this.missing.map((doc) =>
        this.authService.acceptConsent({
          doc_type: doc,
          doc_version: LEGAL_DOC_VERSION,
          method: 'first-login',
        }),
      ),
    )
      .pipe(
        finalize(() => this.submitting.set(false)),
        catchError(() => {
          this.error.set(this.translate.instant('CONSENT.SAVE_ERROR'));
          return EMPTY;
        }),
      )
      .subscribe(() => this.visible.set(false));
  }
}
