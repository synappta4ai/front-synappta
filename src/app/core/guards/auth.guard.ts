import { CanActivateFn, Router } from '@angular/router';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { UserSessionStore } from '../store';
import { APP_ROUTES, AUTH } from '@constants/routes';

/**
 * SSR: en el servidor no hay IndexedDB/localStorage, la sesión nunca podrá
 * restaurarse ahí. Se devuelve `true` para que el SSR renderice el shell y
 * sea el guard en el navegador (con la sesión ya hidratada) quien decida.
 */
function isServer(): boolean {
  return !isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * Permite el acceso a usuarios autenticados.
 * Espera la hidratación de la sesión (IndexedDB) antes de decidir,
 * para que recargar la página no redirija al login.
 */
export const authGuard: CanActivateFn = async () => {
  if (isServer()) {
    return true;
  }

  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  await sessionStore.waitUntilHydrated();

  if (sessionStore.isLoggedIn()) {
    return true;
  }

  // UrlTree en vez de router.navigate(): seguro en SSR y sin efectos de lado.
  return router.createUrlTree([AUTH.ROOT, AUTH.LOGIN]);
};

/**
 * No permite el acceso a usuarios autenticados a la pantalla de login
 */
export const loginGuestGuard: CanActivateFn = async () => {
  if (isServer()) {
    return true;
  }

  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  await sessionStore.waitUntilHydrated();

  if (sessionStore.isLoggedIn()) {
    return router.createUrlTree([APP_ROUTES.ROOT]);
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
