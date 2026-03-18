# Semana 2: Auth + UX del Editor — AuthService + LoginPage + Guards + Tests

**Proyecto:** Typs-Clone
**Timeline:** Semana 2 (6 días) – De app sin auth a producto con identidad de usuario, editor completo y cobertura de tests
**Estado:** Pendiente
**Formato:** AI Agent Execution Plan v2.0
**Dependencias:** Semana 1 (Persistencia + CRUD + IA) ✅ Completa

---

## 🎯 Objetivos de la Semana 2

**Justificación de Prioridades:**
La Semana 1 entregó una app funcional con persistencia real e IA conectada. El problema ahora es que cualquier usuario que acceda a `/app` ve todos los documentos sin autenticarse — no hay identidad de usuario real. Esta semana introduce el flujo de auth mínimo viable (LocalStorage-based), protege las rutas, conecta el Avatar al usuario real, y completa el editor con título editable inline y dark mode en CodeMirror. Cierra con tests unitarios reales para los servicios críticos.

**Qué construimos esta semana:**

1. **`AuthService`** – Modelo `User`, registro/login sobre LocalStorage, signal `currentUser` reactivo
2. **`LoginPage`** – Formulario unificado login/registro con validación, sin dependencias externas
3. **`AuthGuard` + rutas protegidas** – Guard funcional, `app.routes.ts` actualizado, `LandingPage` conectada
4. **Avatar conectado + editor inline** – Avatar muestra usuario real; título editable inline en `EditorHeader`; dark mode en CodeMirror
5. **Tests unitarios** – Vitest tests reales para `DocumentService` y `AuthService`

**Definición de Terminado:**

- Navegar a `/app` sin sesión redirige a `/login`
- Registrar un usuario nuevo persiste en LocalStorage y entra a la app
- Iniciar sesión con credenciales correctas navega a `/app`
- El Avatar muestra el nombre real del usuario logueado
- "Cerrar sesión" en el Avatar destruye la sesión y redirige a `/login`
- Hacer clic en el título del documento en el editor lo hace editable inline
- El editor respeta el dark mode (CodeMirror cambia de tema)
- `npm run build` → 0 errores
- `npm test` → mínimo 15 assertions reales pasando

---

## 📊 Tracker de Progreso Semana 2

```
Semana 2 (Auth + UX del Editor + Tests):
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

⬜ Día 1: AuthService (LocalStorage)           [░░░░░░░░] 0%
⬜ Día 2: LoginPage (login + registro)         [░░░░░░░░] 0%
⬜ Día 3: AuthGuard + rutas + Avatar           [░░░░░░░░] 0%
⬜ Día 4: Título inline + Dark mode editor     [░░░░░░░░] 0%
⬜ Día 5: Tests unitarios                      [░░░░░░░░] 0%
⬜ Día 6: E2E Polish + Validación              [░░░░░░░░] 0%
```

---

## ⚠️ CRÍTICO: Checklist Pre-Implementación

### Paso 1: Verificar entregables de Semana 1

```bash
ls src/app/core/service/document/document.service.ts
ls src/app/core/service/ai/ai.service.ts
ls src/app/shared/components/modal/modal.ts
ls src/app/shared/components/rename-dialog/rename-dialog.ts
ls src/app/shared/components/confirm-delete-dialog/confirm-delete-dialog.ts
ls src/environments/environment.ts
```

**Si falta alguno:** Completar Semana 1 antes de continuar.

### Paso 2: Verificar que no existe auth previo

```bash
ls src/app/core/service/auth/ 2>/dev/null || echo "OK - no existe aún"
ls src/app/core/guards/ 2>/dev/null || echo "OK - no existe aún"
ls src/app/features/auth/ 2>/dev/null || echo "OK - no existe aún"
```

**Esperado:** Los tres directorios no existen — los crearemos en Días 1–3.

### Paso 3: Verificar patrón de providers en app.config.ts

```bash
grep "provideDocumentService\|provideAiService" src/app/app.config.ts
```

**Esperado:** Ambos providers ya están registrados. El `AuthService` seguirá el mismo patrón con `provideAuthService()`.

---

## 🚀 Día 1: AuthService — Modelo de usuario + LocalStorage

### Estado Actual

- ✅ `ThemeService` existe como referencia de patrón (signal + localStorage + effect)
- ✅ `DocumentService` existe con patrón `provideXService()` para providers
- ✅ `AppHeader` tiene `userName = 'John Doe'` y `userRole = 'Admin'` hardcodeados
- ✅ `Avatar` tiene outputs `profileClick` y `signOutClick` sin handlers
- ❌ No existe `src/app/core/service/auth/auth.service.ts`
- ❌ No existe modelo `User`
- ❌ No hay sesión, registro ni login

### Estado Objetivo

- ✅ `src/app/core/service/auth/auth.service.ts` creado con interfaz `User`
- ✅ `currentUser` signal reactivo — `null` si no hay sesión
- ✅ `register(name, email, password)` — crea cuenta, persiste en LS, inicia sesión
- ✅ `login(email, password)` — valida credenciales, restaura sesión
- ✅ `logout()` — destruye sesión, limpia signal
- ✅ `provideAuthService()` registrado en `app.config.ts`
- ✅ Contraseñas almacenadas con hash simple (btoa — no producción, MVP only)

> **Nota para agentes:** Este es un auth de **LocalStorage puro** — sin backend real. Las contraseñas se guardan con `btoa(password)` como ofuscación mínima (NO es seguridad real). El objetivo es tener un flujo completo de UX hasta que se conecte Supabase/Firebase. Los usuarios se guardan en `typs_users` (array) y la sesión activa en `typs_session` (ID del usuario). `DocumentService` **no cambia** — por ahora los documentos son globales (no por usuario). Eso se resuelve en Semana 3 cuando haya backend real. Importar `inject()` de `@angular/core` — no usar constructor injection.

---

### Tarea 1.1: Crear `src/app/core/service/auth/auth.service.ts`

Servicio de autenticación basado en LocalStorage. Mantiene `currentUser` como signal reactivo. El método `register()` verifica que el email no esté ya registrado antes de crear la cuenta. `login()` busca por email y compara el hash de la contraseña.

```typescript
import { Injectable, computed, signal } from '@angular/core';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string; // btoa(password) — MVP only, no producción
  createdAt: string;    // ISO string
}

export interface Session {
  userId: string;
}

export type AuthError =
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND';

const USERS_KEY   = 'typs_users';
const SESSION_KEY = 'typs_session';

@Injectable()
export class AuthService {
  private readonly _users       = signal<User[]>(this.loadUsers());
  private readonly _currentUser = signal<User | null>(this.restoreSession());

  /** Usuario actualmente logueado, o null si no hay sesión. */
  readonly currentUser = this._currentUser.asReadonly();

  /** True si hay un usuario logueado. */
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  // ── Register ──────────────────────────────────────────────────────────────

  register(name: string, email: string, password: string): AuthError | null {
    const normalizedEmail = email.trim().toLowerCase();
    if (this._users().some((u) => u.email === normalizedEmail)) {
      return 'EMAIL_ALREADY_EXISTS';
    }

    const user: User = {
      id:           this.generateId(),
      name:         name.trim(),
      email:        normalizedEmail,
      passwordHash: btoa(password),
      createdAt:    new Date().toISOString(),
    };

    this._users.update((users) => [...users, user]);
    this.persistUsers();
    this.startSession(user);
    return null;
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  login(email: string, password: string): AuthError | null {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this._users().find((u) => u.email === normalizedEmail);

    if (!user) return 'USER_NOT_FOUND';
    if (user.passwordHash !== btoa(password)) return 'INVALID_CREDENTIALS';

    this.startSession(user);
    return null;
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  logout(): void {
    this._currentUser.set(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private startSession(user: User): void {
    this._currentUser.set(user);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id } satisfies Session));
    } catch { /* private mode */ }
  }

  private restoreSession(): User | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      return this.loadUsers().find((u) => u.id === session.userId) ?? null;
    } catch {
      return null;
    }
  }

  private persistUsers(): void {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(this._users()));
    } catch { /* private mode */ }
  }

  private loadUsers(): User[] {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? (JSON.parse(raw) as User[]) : [];
    } catch {
      return [];
    }
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => chars[b % chars.length])
      .join('');
  }
}

export function provideAuthService() {
  return { provide: AuthService, useClass: AuthService };
}
```

**Criterios de Aceptación:**

- [ ] `register()` con email nuevo → retorna `null` y deja `currentUser()` con el nuevo usuario
- [ ] `register()` con email existente → retorna `'EMAIL_ALREADY_EXISTS'` y no modifica usuarios
- [ ] `login()` con credenciales correctas → retorna `null` y restaura `currentUser()`
- [ ] `login()` con email inexistente → retorna `'USER_NOT_FOUND'`
- [ ] `login()` con contraseña incorrecta → retorna `'INVALID_CREDENTIALS'`
- [ ] `logout()` → `currentUser()` es `null` y `typs_session` eliminado de LocalStorage
- [ ] Al recargar la página, si había sesión activa, `currentUser()` se restaura automáticamente
- [ ] `npm run build` → 0 errores

---

### Tarea 1.2: Registrar `AuthService` en `src/app/app.config.ts`

```typescript
import { provideAuthService } from './core/service/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideDocumentService(),
    provideAiService(),
    provideAuthService(), // ← agregar
  ],
};
```

**Criterios de Aceptación:**

- [ ] `inject(AuthService)` resuelve en cualquier componente sin error
- [ ] `npm run build` → 0 errores

---

## 🚀 Día 2: LoginPage — Formulario unificado login/registro

### Estado Actual

- ✅ `AuthService` creado (Día 1)
- ✅ `LandingPage` navega directo a `/app` con `goToApp()` (sin auth check)
- ✅ Componentes compartidos: `Button`, `TextField` disponibles
- ❌ No existe `src/app/features/auth/login-page.ts`
- ❌ No existe ruta `/login` en `app.routes.ts`
- ❌ No hay manejo de errores de formulario en ningún componente

### Estado Objetivo

- ✅ `src/app/features/auth/login-page.ts` creado con modo toggle login/registro
- ✅ Ruta `/login` registrada en `app.routes.ts`
- ✅ Validación de formulario: campos requeridos, email válido, contraseña mínimo 6 chars
- ✅ Mensaje de error mostrado inline cuando `AuthService` retorna un error
- ✅ En éxito → navega a `/app`
- ✅ `LandingPage` actualizada: CTA navega a `/login` (no a `/app`)

> **Nota para agentes:** `LoginPage` es standalone, sin NgModules. Usar signals para el estado del formulario: `email`, `password`, `name`, `mode` ('login' | 'register'), `error`, `isLoading`. **No usar `ReactiveFormsModule` ni `FormsModule`** — manejar inputs con `(input)` events y signals, igual que `AppShell`. El componente debe ser `ChangeDetectionStrategy.OnPush`. Los mensajes de error deben estar en español. La ruta `/login` se agrega **antes** de `**` en `app.routes.ts`.

---

### Tarea 2.1: Crear `src/app/features/auth/login-page.ts`

Página de autenticación con dos modos (login y registro) controlados por el signal `mode`. En modo registro muestra un campo adicional de nombre. Los errores del servicio se mapean a mensajes en español.

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, type AuthError } from '../../core/service/auth/auth.service';
import { Button } from '../../shared/components/button/button';

type FormMode = 'login' | 'register';

const ERROR_MESSAGES: Record<AuthError, string> = {
  EMAIL_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo electrónico.',
  INVALID_CREDENTIALS:  'Contraseña incorrecta. Inténtalo de nuevo.',
  USER_NOT_FOUND:       'No encontramos una cuenta con ese correo electrónico.',
};

@Component({
  selector: 'app-login-page',
  imports: [Button],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);

  readonly mode      = signal<FormMode>('login');
  readonly name      = signal('');
  readonly email     = signal('');
  readonly password  = signal('');
  readonly error     = signal('');
  readonly isLoading = signal(false);

  toggleMode(): void {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
    this.error.set('');
  }

  async submit(): Promise<void> {
    this.error.set('');

    // Basic client-side validation
    if (!this.email().includes('@')) {
      this.error.set('Ingresa un correo electrónico válido.');
      return;
    }
    if (this.password().length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (this.mode() === 'register' && !this.name().trim()) {
      this.error.set('El nombre no puede estar vacío.');
      return;
    }

    this.isLoading.set(true);

    const result =
      this.mode() === 'login'
        ? this.authService.login(this.email(), this.password())
        : this.authService.register(this.name(), this.email(), this.password());

    this.isLoading.set(false);

    if (result !== null) {
      this.error.set(ERROR_MESSAGES[result]);
      return;
    }

    this.router.navigate(['/app']);
  }
}
```

**Criterios de Aceptación:**

- [ ] El formulario alterna entre modo "Iniciar sesión" y "Crear cuenta" con el botón de toggle
- [ ] En modo registro aparece el campo "Nombre"
- [ ] Enviar con email sin "@" muestra error "Ingresa un correo electrónico válido."
- [ ] Enviar con contraseña < 6 chars muestra error correspondiente
- [ ] Login con credenciales correctas → navega a `/app`
- [ ] Login con credenciales incorrectas → muestra mensaje de error en rojo
- [ ] Registro con email duplicado → muestra error "Ya existe una cuenta..."
- [ ] Registro exitoso → navega a `/app` y `authService.currentUser()` no es null
- [ ] `npm run build` → 0 errores

---

### Tarea 2.2: Crear `src/app/features/auth/login-page.html`

Template del formulario de autenticación con diseño centrado, consistente con los tokens de diseño del proyecto.

```html
<div class="min-h-screen bg-background flex flex-col items-center justify-center p-6">

  <!-- Card -->
  <div class="w-full max-w-sm space-y-6">

    <!-- Brand -->
    <div class="text-center space-y-1">
      <p class="text-2xl font-bold text-foreground tracking-tight">
        Typs<span class="text-brand">.</span>
      </p>
      <p class="text-sm text-secondary">
        {{ mode() === 'login' ? 'Inicia sesión en tu cuenta' : 'Crea tu cuenta gratuita' }}
      </p>
    </div>

    <!-- Form card -->
    <div class="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">

      <!-- Name field (register only) -->
      @if (mode() === 'register') {
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-foreground" for="auth-name">Nombre</label>
          <input id="auth-name" type="text" placeholder="Tu nombre completo"
            class="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm
                   text-foreground placeholder:text-muted
                   focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/50 transition"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </div>
      }

      <!-- Email field -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-foreground" for="auth-email">Correo electrónico</label>
        <input id="auth-email" type="email" placeholder="tu@correo.com"
          class="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm
                 text-foreground placeholder:text-muted
                 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/50 transition"
          [value]="email()"
          (input)="email.set($any($event.target).value)"
        />
      </div>

      <!-- Password field -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-foreground" for="auth-password">Contraseña</label>
        <input id="auth-password" type="password"
          [placeholder]="mode() === 'register' ? 'Mínimo 6 caracteres' : 'Tu contraseña'"
          class="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm
                 text-foreground placeholder:text-muted
                 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/50 transition"
          [value]="password()"
          (input)="password.set($any($event.target).value)"
          (keydown.enter)="submit()"
        />
      </div>

      <!-- Error message -->
      @if (error()) {
        <p class="text-xs text-danger-text bg-danger-subtle rounded-lg px-3 py-2">
          {{ error() }}
        </p>
      }

      <!-- Submit -->
      <app-button
        class="w-full"
        size="md"
        [loading]="isLoading()"
        (click)="submit()"
      >
        {{ mode() === 'login' ? 'Iniciar sesión' : 'Crear cuenta' }}
      </app-button>

    </div>

    <!-- Mode toggle -->
    <p class="text-center text-sm text-secondary">
      {{ mode() === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes una cuenta?' }}
      <button type="button"
        class="text-brand font-medium hover:underline focus:outline-none"
        (click)="toggleMode()">
        {{ mode() === 'login' ? 'Crear cuenta' : 'Iniciar sesión' }}
      </button>
    </p>

  </div>

</div>
```

**Criterios de Aceptación:**

- [ ] El diseño es consistente con la LandingPage (fondo `bg-background`, tokens de color)
- [ ] El campo "Nombre" aparece y desaparece al alternar entre modos
- [ ] Presionar Enter en el campo de contraseña dispara `submit()`
- [ ] El botón muestra spinner cuando `isLoading()` es true

---

### Tarea 2.3: Registrar ruta `/login` y actualizar `LandingPage`

Agregar la ruta `/login` en `app.routes.ts` y actualizar el CTA de `LandingPage` para navegar a `/login` en lugar de `/app`.

```typescript
// app.routes.ts
import { LoginPage } from './features/auth/login-page';

export const routes: Routes = [
  { path: '',            component: LandingPage },
  { path: 'login',       component: LoginPage   }, // ← nueva
  { path: 'app',         component: AppLayout   },
  { path: 'project/:id', component: EditorPage  },
  { path: '**',          redirectTo: ''         },
];
```

```typescript
// landing-page.ts — actualizar goToApp()
goToApp(): void {
  this.router.navigate(['/login']); // era /app
}
```

**Criterios de Aceptación:**

- [ ] `/login` renderiza `LoginPage` correctamente
- [ ] El botón "Empezar" en `LandingPage` navega a `/login`
- [ ] `npm run build` → 0 errores

---

## 🚀 Día 3: AuthGuard + Rutas Protegidas + Avatar Conectado

### Estado Actual

- ✅ `AuthService` con `isAuthenticated` computed signal (Día 1)
- ✅ `LoginPage` en ruta `/login` (Día 2)
- ✅ `AppHeader` con `userName` y `userRole` hardcodeados
- ✅ `Avatar` con outputs `profileClick` y `signOutClick` sin handlers
- ❌ No existe guard funcional
- ❌ Las rutas `/app` y `/project/:id` son públicas

### Estado Objetivo

- ✅ `src/app/core/guards/auth.guard.ts` creado como función pura
- ✅ Rutas `app` y `project/:id` protegidas con `canActivate: [authGuard]`
- ✅ `AppHeader` inyecta `AuthService` y pasa datos reales al `Avatar`
- ✅ `Avatar` "Cerrar sesión" llama a `authService.logout()` y navega a `/login`

> **Nota para agentes:** El guard es una **función** (no clase), siguiendo el patrón funcional de Angular 15+. Usar `inject()` dentro de la función para acceder a `AuthService` y `Router`. Si `!authService.isAuthenticated()` → redirigir a `/login` con `router.createUrlTree(['/login'])`. Leer `src/app/app.routes.ts` completo antes de modificar para no romper rutas existentes. El `AppHeader` usa `userName` y `userRole` como propiedades simples — convertirlos a `computed()` que leen de `AuthService`.

---

### Tarea 3.1: Crear `src/app/core/guards/auth.guard.ts`

Guard funcional que verifica `AuthService.isAuthenticated()`. Si no hay sesión, redirige a `/login`.

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login']);
};
```

**Criterios de Aceptación:**

- [ ] Navegar a `/app` sin sesión redirige automáticamente a `/login`
- [ ] Navegar a `/project/cualquier-id` sin sesión redirige a `/login`
- [ ] Con sesión activa, `/app` y `/project/:id` cargan normalmente
- [ ] El guard no afecta las rutas `/` y `/login`

---

### Tarea 3.2: Proteger rutas en `app.routes.ts`

Agregar `canActivate: [authGuard]` a las rutas `/app` y `/project/:id`.

```typescript
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '',            component: LandingPage },
  { path: 'login',       component: LoginPage   },
  {
    path: 'app',
    component: AppLayout,
    canActivate: [authGuard],
  },
  {
    path: 'project/:id',
    component: EditorPage,
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
```

**Criterios de Aceptación:**

- [ ] `npm run build` → 0 errores
- [ ] Acceso a rutas protegidas sin sesión → redirección a `/login`

---

### Tarea 3.3: Conectar `AppHeader` y `Avatar` al `AuthService`

Reemplazar `userName`/`userRole` hardcodeados con computed signals que leen del `AuthService`. Implementar `signOutClick` para llamar `logout()` y navegar a `/login`.

```typescript
// app-header.ts
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/service/auth/auth.service';
import { ThemeService } from '../../../core/service/theme/theme-service';

export class AppHeader {
  protected readonly theme = inject(ThemeService);
  private  readonly auth   = inject(AuthService);
  private  readonly router = inject(Router);

  protected readonly userName = computed(() => this.auth.currentUser()?.name ?? 'Usuario');
  protected readonly userRole = computed(() => this.auth.currentUser()?.email ?? '');

  signOut(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  readonly Moon = Moon;
  readonly Sun  = Sun;
}
```

```html
<!-- app-header.html — actualizar Avatar -->
<app-avatar
  [name]="userName()"
  [role]="userRole()"
  (signOutClick)="signOut()"
/>
```

**Criterios de Aceptación:**

- [ ] El Avatar muestra el nombre real del usuario logueado (no "John Doe")
- [ ] El Avatar muestra el email como subtítulo (rol por ahora)
- [ ] Hacer clic en "Cerrar sesión" destruye la sesión y navega a `/login`
- [ ] Al hacer logout y navegar a `/app`, el guard redirige a `/login`
- [ ] `npm run build` → 0 errores

---

## 🚀 Día 4: Título Editable Inline + Dark Mode en CodeMirror

### Estado Actual

- ✅ `EditorHeader` muestra `documentTitle` como `<span>` no editable
- ✅ `DocumentService` tiene método `rename(id, title)` funcional
- ✅ `EditorPage` tiene `documentId` y `documentTitle` signal
- ✅ `EditorPanel` tiene tema CodeMirror hardcodeado en light mode (bgcolor `#ffffff`)
- ✅ `ThemeService` tiene signal `isDark` disponible globalmente
- ❌ El título del documento no es editable desde el editor
- ❌ CodeMirror no cambia de tema cuando el usuario alterna dark mode

### Estado Objetivo

- ✅ Hacer clic en el título en `EditorHeader` lo convierte en un `<input>` editable
- ✅ Blur o Enter en el input confirma el rename vía `DocumentService.rename()`
- ✅ Escape cancela la edición y restaura el título original
- ✅ `EditorPanel` usa tema dark cuando `ThemeService.isDark()` es true
- ✅ Al alternar dark mode, CodeMirror cambia de tema en tiempo real

> **Nota para agentes:** Para el título editable, agregar un signal `isEditingTitle` en `EditorPage` (o en `EditorHeader` directamente como estado local). Al confirmar, `EditorPage` llama `documentService.rename(documentId, newTitle)` y actualiza `documentTitle` signal. Para CodeMirror dark mode: `EditorPanel` necesita un input `isDark = input<boolean>(false)`. Cuando cambia, hay que reconfigurar el `EditorView` o usar `EditorView.reconfigure()`. La forma más limpia es usar `effect()` para detectar cambios en `isDark()` y llamar `this.view?.dispatch({ effects: themeCompartment.reconfigure(newTheme) })`. Ver documentación de CodeMirror `Compartment` para reconfiguration dinámica.

---

### Tarea 4.1: Título editable inline en `EditorHeader`

Agregar estado de edición al `EditorHeader`. Al hacer clic en el título, se muestra un `<input>` con el valor actual pre-seleccionado. Blur o Enter confirma; Escape cancela.

```typescript
// Agregar en editor-header.ts
readonly titleChange = output<string>(); // nuevo output

// Signals de edición (locales al header)
protected readonly isEditing   = signal(false);
protected readonly editingTitle = signal('');

protected startEditing(): void {
  this.editingTitle.set(this.documentTitle());
  this.isEditing.set(true);
}

protected confirmEdit(value: string): void {
  const trimmed = value.trim();
  if (trimmed && trimmed !== this.documentTitle()) {
    this.titleChange.emit(trimmed);
  }
  this.isEditing.set(false);
}

protected cancelEdit(): void {
  this.isEditing.set(false);
}
```

```html
<!-- En editor-header.html — reemplazar el <span> del título -->
@if (isEditing()) {
  <input
    #titleInput
    type="text"
    class="text-sm font-medium text-foreground bg-transparent border-b border-brand
           focus:outline-none max-w-[24ch] px-0.5"
    [value]="editingTitle()"
    (blur)="confirmEdit($any($event.target).value)"
    (keydown.enter)="confirmEdit($any($event.target).value)"
    (keydown.escape)="cancelEdit()"
  />
} @else {
  <button type="button"
    class="text-sm font-medium text-foreground hover:text-brand truncate max-w-[20ch]
           focus:outline-none transition-colors"
    title="Clic para renombrar"
    (click)="startEditing()">
    {{ documentTitle() }}
  </button>
}
```

```typescript
// En editor-page.ts — manejar titleChange
onTitleChange(newTitle: string): void {
  this.documentService.rename(this.documentId, newTitle);
  this.documentTitle.set(newTitle);
}
```

**Criterios de Aceptación:**

- [ ] Hacer clic en el título en el editor lo convierte en un input editable
- [ ] Presionar Enter confirma el nuevo nombre
- [ ] Hacer blur (clic fuera) confirma el nuevo nombre
- [ ] Presionar Escape cancela sin cambiar el nombre
- [ ] El nuevo nombre se persiste en LocalStorage (visible al recargar)
- [ ] El título actualizado se refleja en la tarjeta del home
- [ ] El input no aparece si ya estás editando (no se apila)

---

### Tarea 4.2: Dark mode reactivo en `EditorPanel`

Agregar input `isDark` a `EditorPanel` y usar un `Compartment` de CodeMirror para reconfiguration dinámica del tema sin destruir el editor.

```typescript
import { Compartment } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { effect, inject, input } from '@angular/core';
import { ThemeService } from '../../../../core/service/theme/theme-service';

// Fuera de la clase — compartment singleton
const themeCompartment = new Compartment();

function buildTheme(isDark: boolean) {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: isDark ? '#1e1e2e' : '#ffffff',
      color:           isDark ? '#cdd6f4' : '#000000',
    },
    '.cm-content': {
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      caretColor: isDark ? '#cdd6f4' : '#000000',
    },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': {
      backgroundColor: isDark ? '#181825' : '#f5f5f5',
      color:           isDark ? '#6c7086' : '#666',
      border: 'none',
    },
    '.cm-activeLine':       { backgroundColor: isDark ? '#313244' : '#f0f0f0' },
    '.cm-activeLineGutter': { backgroundColor: isDark ? '#2a2a3d' : '#eaeaea' },
    '.cm-selectionBackground': { backgroundColor: isDark ? '#45475a' : '#cce5ff' },
  }, { dark: isDark });
}

export class EditorPanel implements OnDestroy {
  private readonly theme = inject(ThemeService);
  // ... existing inputs ...

  constructor() {
    afterNextRender(() => {
      const isDark = this.theme.isDark();
      this.view = new EditorView({
        state: EditorState.create({
          doc: this.initialContent(),
          extensions: [
            basicSetup,
            themeCompartment.of(buildTheme(isDark)),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                this.contentChange.emit(update.state.doc.toString());
              }
            }),
          ],
        }),
        parent: this.host().nativeElement,
      });

      // Reconfigurar el tema cuando isDark cambia
      effect(() => {
        const dark = this.theme.isDark();
        this.view?.dispatch({
          effects: themeCompartment.reconfigure(buildTheme(dark)),
        });
      });
    });
  }
}
```

**Criterios de Aceptación:**

- [ ] En light mode, el editor muestra fondo blanco y texto oscuro
- [ ] En dark mode, el editor muestra fondo oscuro (#1e1e2e) y texto claro
- [ ] Al hacer toggle del dark mode, el tema del editor cambia sin recargar la página
- [ ] El contenido del editor no se pierde al cambiar de tema
- [ ] `npm run build` → 0 errores

---

## 🚀 Día 5: Tests Unitarios — DocumentService + AuthService

### Estado Actual

- ✅ Vitest configurado (`npm test` funciona)
- ✅ `compiler-service.spec.ts` tiene 1 test básico como referencia de patrón
- ✅ `DocumentService` tiene CRUD completo + multi-archivo
- ✅ `AuthService` tiene register/login/logout
- ❌ No hay tests reales para `DocumentService`
- ❌ No hay tests para `AuthService`
- ❌ No hay tests para los dialogs (RenameDialog, ConfirmDeleteDialog)

### Estado Objetivo

- ✅ `src/app/core/service/document/document.service.spec.ts` con ≥10 tests
- ✅ `src/app/core/service/auth/auth.service.spec.ts` con ≥8 tests
- ✅ Todos los tests pasan con `npm test`
- ✅ LocalStorage mockeado para aislar tests

> **Nota para agentes:** Leer `src/app/core/service/compiler/compiler-service.spec.ts` para ver el patrón exacto de bootstrap de tests en este proyecto. Usar `TestBed.configureTestingModule` con `providers: [DocumentService]` (sin `provideDocumentService()` — directo para testing). Mockear `localStorage` con `vi.spyOn(window.localStorage, 'getItem').mockReturnValue(...)`. Para `DocumentService`, mockear también `Router` ya que `create()` navega. Cada test debe limpiar localStorage con `localStorage.clear()` en `beforeEach`.

---

### Tarea 5.1: Crear `document.service.spec.ts`

Tests completos para DocumentService: CRUD, multi-archivo, serialización de fechas, back-compat.

```typescript
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from './document.service';

describe('DocumentService', () => {
  let service: DocumentService;
  const mockRouter = { navigate: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DocumentService,
        { provide: Router, useValue: mockRouter },
      ],
    });
    service = TestBed.inject(DocumentService);
  });

  it('debería crearse correctamente', () => {
    expect(service).toBeTruthy();
  });

  it('create() debe agregar documento y navegar al editor', () => {
    service.create();
    expect(service.documents().length).toBe(1);
    expect(service.documents()[0].title).toBe('Sin título');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/project', expect.any(String)]);
  });

  it('create() debe persistir en localStorage', () => {
    service.create();
    const saved = localStorage.getItem('typs_documents');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!).length).toBe(1);
  });

  it('getById() debe retornar el documento correcto', () => {
    service.create();
    const id = service.documents()[0].id;
    const doc = service.getById(id);
    expect(doc).toBeDefined();
    expect(doc?.id).toBe(id);
  });

  it('getById() debe retornar undefined para ID inexistente', () => {
    expect(service.getById('ID_FALSO')).toBeUndefined();
  });

  it('rename() debe actualizar el título', () => {
    service.create();
    const id = service.documents()[0].id;
    service.rename(id, 'Nuevo Título');
    expect(service.documents()[0].title).toBe('Nuevo Título');
  });

  it('rename() debe ignorar títulos vacíos', () => {
    service.create();
    const id = service.documents()[0].id;
    service.rename(id, '   ');
    expect(service.documents()[0].title).toBe('Sin título');
  });

  it('delete() debe eliminar el documento', () => {
    service.create();
    const id = service.documents()[0].id;
    service.delete(id);
    expect(service.documents().length).toBe(0);
  });

  it('saveContent() debe actualizar contenido y updatedAt', async () => {
    service.create();
    const id  = service.documents()[0].id;
    const before = service.getById(id)!.updatedAt;
    await new Promise((r) => setTimeout(r, 10)); // pequeño delay
    service.saveContent(id, '= Nuevo contenido');
    expect(service.getById(id)?.content).toBe('= Nuevo contenido');
    expect(service.getById(id)!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('loadFromStorage() debe restaurar fechas como objetos Date', () => {
    service.create();
    // Recrear el servicio para simular recarga
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [DocumentService, { provide: Router, useValue: mockRouter }],
    });
    const restored = TestBed.inject(DocumentService);
    expect(restored.documents()[0].updatedAt).toBeInstanceOf(Date);
  });
});
```

**Criterios de Aceptación:**

- [ ] Mínimo 10 tests en el archivo
- [ ] Todos los tests pasan con `npm test`
- [ ] Tests son independientes (cada uno limpia localStorage en `beforeEach`)
- [ ] No hay tests con `expect(true).toBe(true)` (assertions vacías)

---

### Tarea 5.2: Crear `auth.service.spec.ts`

Tests para el flujo completo de registro, login y logout del `AuthService`.

```typescript
import { TestBed } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [AuthService] });
    service = TestBed.inject(AuthService);
  });

  it('debería crearse correctamente', () => {
    expect(service).toBeTruthy();
  });

  it('currentUser() debe ser null al inicio', () => {
    expect(service.currentUser()).toBeNull();
  });

  it('register() exitoso debe retornar null y dejar currentUser activo', () => {
    const err = service.register('Ana', 'ana@test.com', 'password123');
    expect(err).toBeNull();
    expect(service.currentUser()).not.toBeNull();
    expect(service.currentUser()?.name).toBe('Ana');
  });

  it('register() con email duplicado debe retornar EMAIL_ALREADY_EXISTS', () => {
    service.register('Ana', 'ana@test.com', 'password123');
    const err = service.register('Ana2', 'ana@test.com', 'otropass');
    expect(err).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('login() con credenciales correctas debe retornar null', () => {
    service.register('Ana', 'ana@test.com', 'password123');
    service.logout();
    const err = service.login('ana@test.com', 'password123');
    expect(err).toBeNull();
    expect(service.currentUser()?.email).toBe('ana@test.com');
  });

  it('login() con email inexistente debe retornar USER_NOT_FOUND', () => {
    expect(service.login('no_existe@test.com', 'pass')).toBe('USER_NOT_FOUND');
  });

  it('login() con contraseña incorrecta debe retornar INVALID_CREDENTIALS', () => {
    service.register('Ana', 'ana@test.com', 'password123');
    service.logout();
    expect(service.login('ana@test.com', 'wrongpass')).toBe('INVALID_CREDENTIALS');
  });

  it('logout() debe limpiar currentUser y la sesión en localStorage', () => {
    service.register('Ana', 'ana@test.com', 'password123');
    service.logout();
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('typs_session')).toBeNull();
  });

  it('isAuthenticated() debe ser true tras login y false tras logout', () => {
    expect(service.isAuthenticated()).toBe(false);
    service.register('Ana', 'ana@test.com', 'password123');
    expect(service.isAuthenticated()).toBe(true);
    service.logout();
    expect(service.isAuthenticated()).toBe(false);
  });
});
```

**Criterios de Aceptación:**

- [ ] Mínimo 8 tests en el archivo
- [ ] Todos los tests pasan con `npm test`
- [ ] Tests son independientes (localStorage limpio en cada `beforeEach`)

---

## 🚀 Día 6: E2E Polish + Validación

### UX español — deuda pendiente de Semana 1

```typescript
// app-sidebar.ts — navItems (cambiar label)
readonly navItems = [
  { label: 'Documentos', href: '/app', icon: FileText }, // era 'Documents' y href '/'
];

// avatar.html — cambiar textos de Profile / Sign Out
// "Profile" → "Perfil", "Sign Out" → "Cerrar sesión"
```

### Verificaciones técnicas

```bash
npm run build
npx tsc --noEmit
npm test
```

### Script de validación manual

1. **Flujo completo de registro:** Ir a `/` → "Empezar" → `/login` → crear cuenta → llegar a `/app`
2. **Protección de rutas:** Abrir `/app` en incógnito → debe redirigir a `/login`
3. **Login con cuenta existente:** Hacer logout → volver a `/login` → iniciar sesión → `/app`
4. **Avatar con nombre real:** Verificar que el avatar muestra el nombre registrado, no "John Doe"
5. **Cerrar sesión:** Avatar → "Cerrar sesión" → redirige a `/login` → `/app` está bloqueado
6. **Título editable:** Abrir un documento → hacer clic en el título en el header → editarlo → Enter → verificar cambio en home
7. **Cancelar edición:** Clic en título → editar → Escape → título vuelve al original
8. **Dark mode en editor:** Abrir editor → toggle dark mode → CodeMirror debe cambiar a tema oscuro
9. **Toggle dark mode:** Alternar varias veces → el editor sigue siendo editable y sin pérdida de contenido
10. **Sidebar en español:** Verificar que la nav muestra "Documentos" (no "Documents")
11. **Avatar en español:** Verificar "Perfil" y "Cerrar sesión" en el menú del avatar
12. **Tests:** `npm test` → todos pasan con ≥18 assertions

### Deuda técnica pendiente para Semana 3

- [ ] `DocumentService` debe filtrar documentos por `userId` (actualmente todos los docs son globales)
- [ ] `@angular/forms` — evaluar si conviene migrar los formularios de auth a `ReactiveFormsModule`
- [ ] Contraseñas con hash real (bcrypt o similar) cuando haya backend
- [ ] `EditorPanel` — el `effect()` creado dentro de `afterNextRender` puede tener problemas de cleanup; revisar si necesita `manualCleanup`
- [ ] PDF export — implementar descarga de PDF compilado desde WASM
- [ ] Colaboración en tiempo real — Yjs + WebSockets (requiere backend)

---

**Versión del Documento:** 1.0
**Última actualización:** 2026-03-16
**Formato:** AI Agent Execution Plan v2.0
