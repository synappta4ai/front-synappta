import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UserSessionStore } from '../store';
import { APP_ROUTES, AUTH } from '@constants/routes';

/**
 * Permite el acceso a usuarios autenticados
 * @returns
 */
export const authGuard: CanActivateFn = () => {
  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  if (sessionStore.isLoggedIn()) {
    return true;
  }

  return router.navigate([AUTH.ROOT, AUTH.LOGIN]);
};

/**
 * No permite el acceso a usuarios autenticados a la pantalla de login
 * @returns boolean
 */
export const loginGuestGuard: CanActivateFn = () => {
  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  console.log('isLoggedIn', sessionStore.isLoggedIn());
  if (sessionStore.isLoggedIn()) {
    return router.navigate([APP_ROUTES.ROOT]);
  }

  return true;
};

export const moduleGuard = (moduleName: string): CanActivateFn => {
  return () => {
    const sessionStore = inject(UserSessionStore);
    const router = inject(Router);

    // if (sessionStore.hasModule(moduleName)) {
    //   return true;
    // }

    return true;
  };
};
