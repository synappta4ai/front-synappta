import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@modules/auth/services/auth.service';

export const superadminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const roleLevel = authService.roleLevel();

  if (roleLevel === null || roleLevel !== 0) {
    return router.createUrlTree(['/agency']);
  }

  return true;
};
