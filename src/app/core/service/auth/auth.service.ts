import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { User } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase.client';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);

  private readonly _user        = signal<User | null>(null);
  private readonly _loading     = signal(false);
  private readonly _error       = signal<string | null>(null);
  /** True once getSession() ha resuelto. Los guards esperan este signal. */
  private readonly _initialized = signal(false);

  // ── Public reactive state ─────────────────────────────────────────────────

  readonly user            = this._user.asReadonly();
  readonly loading         = this._loading.asReadonly();
  readonly error           = this._error.asReadonly();
  readonly initialized     = this._initialized.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    // Restore session from storage on init. Marca initialized cuando resuelve.
    this.supabase.auth.getSession().then(({ data }) => {
      this._user.set(data.session?.user ?? null);
      this._initialized.set(true);
    });

    // Keep state in sync with Supabase auth events (login, logout, token refresh)
    this.supabase.auth.onAuthStateChange((_, session) => {
      this._user.set(session?.user ?? null);
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async signIn(email: string, password: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    const { error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error) {
      this._error.set(error.message);
    } else {
      await this.router.navigate(['/app']);
    }

    this._loading.set(false);
  }

  async signUp(email: string, password: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    const { error } = await this.supabase.auth.signUp({ email, password });

    if (error) {
      this._error.set(error.message);
    }

    this._loading.set(false);
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    await this.router.navigate(['/login']);
  }

  clearError(): void {
    this._error.set(null);
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideAuthService() {
  return { provide: AuthService, useClass: AuthService };
}
