import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../service/auth/auth.service';

/**
 * Espera a que AuthService haya resuelto la sesión de Supabase (initialized)
 * antes de tomar la decisión. Sin esto, un refresh redirige al login porque
 * isAuthenticated() es false mientras getSession() todavía está en vuelo.
 */
function waitForAuth() {
  const auth   = inject(AuthService);
  const router = inject(Router);
  return { auth, router, ready$: toObservable(auth.initialized).pipe(filter(Boolean), take(1)) };
}

/** Protects routes that require a logged-in user. Redirects to /login if not authenticated. */
export const authGuard: CanActivateFn = () => {
  const { auth, router, ready$ } = waitForAuth();
  return ready$.pipe(
    map(() => auth.isAuthenticated() ? true : router.createUrlTree(['/login'])),
  );
};

/** Redirects already-authenticated users away from the login page to /app. */
export const guestGuard: CanActivateFn = () => {
  const { auth, router, ready$ } = waitForAuth();
  return ready$.pipe(
    map(() => auth.isAuthenticated() ? router.createUrlTree(['/app']) : true),
  );
};
