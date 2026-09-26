import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';

import { UserSessionStore } from '../store';

export const superadminGuard: CanActivateFn = async () => {
  // SSR: sin sesión en el servidor; el guard del navegador decide tras hidratar.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }

  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  await sessionStore.waitUntilHydrated();

  const user = sessionStore.currentUser();

  if (!user || user.role_level !== 0) {
    return router.createUrlTree(['/agency']);
  }

  return true;
};
