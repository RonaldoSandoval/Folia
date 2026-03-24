import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService, type ToastType } from '../../../core/service/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);

  protected toastClasses(type: ToastType): string {
    const base = 'flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm min-w-[260px] max-w-sm border';
    const variants: Record<ToastType, string> = {
      success: `${base} bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400`,
      error:   `${base} bg-red-500/10   border-red-500/30   text-red-700   dark:text-red-400`,
      warning: `${base} bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400`,
      info:    `${base} bg-brand/10     border-brand/30     text-brand`,
    };
    return variants[type];
  }

  protected icon(type: ToastType): string {
    const icons: Record<ToastType, string> = {
      success: '✓',
      error:   '✕',
      warning: '⚠',
      info:    'ℹ',
    };
    return icons[type];
  }
}
