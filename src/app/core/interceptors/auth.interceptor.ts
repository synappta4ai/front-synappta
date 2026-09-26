import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { UserSessionStore } from '@core/store';
import { AUTH } from '@core/constants';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  const token = sessionStore.token();
  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        isPlatformBrowser(platformId) &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        // Solo redirigir en el navegador: en SSR no hay sesión y una
        // navegación durante el render del servidor no es válida.
        void router.navigate([AUTH.ROOT, AUTH.LOGIN]);
      }
      return throwError(() => error);
    }),
  );
};
