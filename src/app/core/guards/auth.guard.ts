import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  auth.logout();
  return router.createUrlTree(['/login']);
};

export const loginRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return router.parseUrl(auth.resolvePreferredUrl());
  }

  return true;
};

export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    auth.logout();
    return router.createUrlTree(['/login']);
  }

  const requiredPermission = route.data?.['permission'];
  if (!requiredPermission) {
    return true;
  }

  const permissions = auth.profile?.permissions || [];
  if (permissions.includes(requiredPermission)) {
    return true;
  }

  return router.createUrlTree(['/tabs/dashboard']);
};
