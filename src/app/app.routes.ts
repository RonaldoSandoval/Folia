import { Routes } from '@angular/router';
import { LandingPage } from './layout/landing/landing-page';
import { AppLayout } from './layout/app/app-layout/app-layout';
import { EditorPage } from './features/editor/editor-page';
import { LoginPage } from './features/auth/login/login-page';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '',            component: LandingPage                              },
  { path: 'login',       component: LoginPage,   canActivate: [guestGuard]  },
  { path: 'app',         component: AppLayout,   canActivate: [authGuard]   },
  { path: 'project/:id', component: EditorPage,  canActivate: [authGuard]   },
  { path: '**',          redirectTo: ''                                      },
];
