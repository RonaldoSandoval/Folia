import { Routes } from '@angular/router';
import { LandingPage } from './layout/landing/landing-page';
import { AppLayout } from './layout/app/app-layout/app-layout';
import { LoginPage } from './features/auth/login/login-page';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '',            component: LandingPage                                                                  },
  { path: 'login',       component: LoginPage,   canActivate: [guestGuard]                                      },
  { path: 'app',         component: AppLayout,   canActivate: [authGuard]                                       },
  {
    path:          'project/:id',
    canActivate:   [authGuard],
    // Lazy-loaded: EditorPage (CodeMirror, Yjs, WASM worker) is excluded from
    // the initial bundle and only fetched when the user opens a document.
    loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
  },
  { path: '**',          redirectTo: ''                                                                          },
];
