import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserSessionStore } from '../store';

export const superadminGuard: CanActivateFn = () => {
  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  const user = sessionStore.currentUser();

  if (!user || user.role_level !== 0) {
    return router.createUrlTree(['/agency']);
  }

  return true;
};
