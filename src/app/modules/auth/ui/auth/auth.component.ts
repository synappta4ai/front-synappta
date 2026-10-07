import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { PasswordModule } from 'primeng/password';

import { AuthService } from '../../services/auth.service';
import { ValidatorErrors } from '@shared/components/index';
import { FormControlErrorClassPipe } from '@core/pipes';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    Button,
    Card,
    InputText,
    Message,
    IconField,
    FormControlErrorClassPipe,
    InputIcon,
    PasswordModule,
    ValidatorErrors,
  ],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(0);

  protected form = this.formBuilder.group({
    username: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(30)]],
    password: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(30)]],
  });

  protected onSubmit(): void {
    this.form.markAllAsTouched();
    this.submitted.update((v) => v + 1);

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const { username, password } = this.form.getRawValue();

    if (!username || !password) return;

    this.authService.login({ username, password }).subscribe({
      next: () => {
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/studio';

        void this.router.navigateByUrl(redirectTo);
      },
      error: (err: unknown) => {
        this.error.set(this.readErrorMessage(err));
        this.submitting.set(false);
      },
    });
  }

  /** Error de login: prioriza el message del response; si no hay cuerpo,
   *  un texto explícito según el estado HTTP. */
  private readErrorMessage(err: unknown): string {
    // 1) Cuerpo del response: { success:false, message } o string plano.
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const fromBody = this.bodyMessage((err as { error: unknown }).error);
      if (fromBody) {
        return fromBody;
      }
      // 2) Sin cuerpo legible: explícito según estado HTTP.
      const status = (err as { status?: unknown }).status;
      if (typeof status === 'number') {
        if (status === 0) {
          return this.translate.instant('AUTH.NETWORK_ERROR');
        }
        if (status === 401) {
          return this.translate.instant('AUTH.INVALID_CREDENTIALS');
        }
        if (status >= 500) {
          return this.translate.instant('AUTH.SERVER_ERROR');
        }
      }
    }
    // 3) Error de unwrap() con success:false: conserva el message del response.
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return this.translate.instant('AUTH.LOGIN_ERROR');
  }

  /** Lee el message de un body JSON {message} o de un string plano (sin HTML). */
  private bodyMessage(body: unknown): string | null {
    if (typeof body === 'string') {
      const text = body.trim();
      return text && !text.startsWith('<') ? text : null;
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }
    return null;
  }
}
