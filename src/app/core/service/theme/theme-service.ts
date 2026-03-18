import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

/** localStorage key used to persist the user's theme preference. */
const STORAGE_KEY = 'typs-theme';

/**
 * Application-wide theme service.
 *
 * Manages the light / dark color scheme by toggling the `dark` CSS class on
 * the `<html>` element. Components read `isDark` to reflect the current state
 * in the UI; nothing else needs to touch the DOM directly.
 *
 * **Initialization order:**
 * 1. Check `localStorage` for a previously saved preference.
 * 2. Fall back to the OS-level `prefers-color-scheme` media query.
 * 3. Default to light mode if neither is available.
 *
 * **Persistence:** every toggle is written to `localStorage` so the preference
 * survives page reloads.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** `true` when dark mode is active. Reactive — safe to use in templates. */
  readonly isDark = signal<boolean>(this.resolveInitialTheme());

  constructor() {
    // Apply the theme to <html> whenever isDark changes.
    // Runs once immediately on construction to sync the DOM with the initial value.
    effect(() => this.applyTheme(this.isDark()));
  }

  /** Flips between dark and light mode. */
  toggle(): void {
    this.isDark.update((current) => !current);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Determines the theme that should be active on startup.
   * Reads localStorage first, then the OS media query, then defaults to light.
   */
  private resolveInitialTheme(): boolean {
    const stored = this.getStoredTheme();
    if (stored !== null) return stored === 'dark';

    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
  }

  /**
   * Adds or removes the `dark` class on `<html>` and persists the choice
   * to `localStorage`.
   */
  private applyTheme(dark: boolean): void {
    this.document.documentElement.classList.toggle('dark', dark);

    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // localStorage may be unavailable in private-browsing modes — ignore.
    }
  }

  /** Returns the stored theme string, or `null` if nothing is saved yet. */
  private getStoredTheme(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
