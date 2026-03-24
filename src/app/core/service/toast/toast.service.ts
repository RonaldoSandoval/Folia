import { Injectable, signal } from '@angular/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id:      string;
  type:    ToastType;
  message: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Lightweight signal-based toast notification service.
 *
 * Inject anywhere and call success() / error() / warning() / info().
 * Toasts auto-dismiss after their configured duration.
 * ToastContainer (in app.html) renders the queue.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);

  /** Read-only snapshot consumed by ToastContainer. */
  readonly toasts = this._toasts.asReadonly();

  success(message: string, duration = 3_000): void { this.add('success', message, duration); }
  error(message: string,   duration = 5_000): void { this.add('error',   message, duration); }
  warning(message: string, duration = 4_000): void { this.add('warning', message, duration); }
  info(message: string,    duration = 3_000): void { this.add('info',    message, duration); }

  dismiss(id: string): void {
    this._toasts.update((ts) => ts.filter((t) => t.id !== id));
  }

  private add(type: ToastType, message: string, duration: number): void {
    const id = crypto.randomUUID();
    this._toasts.update((ts) => [...ts, { id, type, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}
