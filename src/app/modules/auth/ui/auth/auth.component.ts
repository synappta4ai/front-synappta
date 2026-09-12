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
        const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo') ?? '/agency';

        void this.router.navigateByUrl(redirectTo);
      },
      error: (err: unknown) => {
        this.error.set(this.readErrorMessage(err));
        this.submitting.set(false);
      },
    });
  }

  private readErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const body = (err as { error: unknown }).error;
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const message = (body as { message: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
      }
    }
    return this.translate.instant('AUTH.LOGIN_ERROR');
  }
}
