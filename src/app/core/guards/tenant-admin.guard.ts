import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

import { UserSessionStore } from '../store';

/**
 * Permite el acceso a administradores de tenant (role_level ≤ 1: ADMIN o
 * SUPER_ADMIN de plataforma). El back aplica el mismo criterio con
 * RequireRole(1) en los endpoints; acá evitamos pantallas que siempre
 * devolverían 403.
 */
export const tenantAdminGuard: CanActivateFn = async () => {
  // SSR: sin sesión en el servidor; el guard del navegador decide tras hidratar.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  await sessionStore.waitUntilHydrated();

  const roleLevel = sessionStore.currentUser()?.role_level;
  if (roleLevel === undefined || roleLevel === null || roleLevel > 1) {
    return router.createUrlTree(['/agency']);
  }

  return true;
};
