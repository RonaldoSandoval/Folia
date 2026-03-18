import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';
import { Spinner } from '../spinner/spinner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Visual style of the button.
 * - `primary` — filled gradient brand button; use for the main CTA on a page.
 * - `secondary` — outlined neutral button; use for secondary actions.
 * - `ghost` — no border or background; use for low-emphasis or icon-only actions.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Size scale for the button. */
export type ButtonSize = 'sm' | 'md' | 'lg';

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-linear-to-r from-brand to-brand-icon text-white shadow-sm ' +
    'hover:from-brand-icon hover:to-brand-deep hover:shadow-md',
  secondary:
    'border border-border bg-surface text-foreground ' +
    'hover:bg-surface-hover',
  ghost:
    'text-secondary hover:bg-surface-hover hover:text-foreground',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg  gap-1.5',
  md: 'px-5 py-2   text-sm rounded-lg  gap-2',
  lg: 'px-6 py-3   text-sm rounded-xl  gap-2.5',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable button that adapts to the active color theme.
 *
 * Content is projected via `ng-content`. An optional Lucide icon can be
 * placed to the left of the label using the `icon` input. When `loading`
 * is `true`, the icon/content is replaced by an inline `Spinner`.
 *
 * @example
 * ```html
 * <app-button>Save</app-button>
 * <app-button variant="secondary" size="sm" [icon]="TrashIcon">Delete</app-button>
 * <app-button variant="primary" [loading]="isSaving">Saving…</app-button>
 * ```
 */
@Component({
  selector: 'app-button',
  imports: [LucideAngularModule, Spinner],
  templateUrl: './button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  /** Visual style. Defaults to `'primary'`. */
  variant = input<ButtonVariant>('primary');

  /** Size scale. Defaults to `'md'`. */
  size = input<ButtonSize>('md');

  /** Native button `type` attribute. Defaults to `'button'`. */
  type = input<'button' | 'submit' | 'reset'>('button');

  /** Optional Lucide icon rendered to the left of the label. */
  icon = input<LucideIconData | null>(null);

  /** When `true`, replaces content with a `Spinner` and disables the button. */
  loading = input<boolean>(false);

  /** When `true`, the button is non-interactive and visually dimmed. */
  disabled = input<boolean>(false);

  /** Combined class string derived from variant and size inputs. */
  protected readonly buttonClasses = computed(() =>
    [
      'inline-flex items-center justify-center font-semibold',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-brand/40',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      VARIANT_CLASSES[this.variant()],
      SIZE_CLASSES[this.size()],
    ].join(' '),
  );

  /** Spinner color that matches each variant so it is always legible. */
  protected readonly spinnerColor = computed(() =>
    this.variant() === 'primary' ? 'white' : 'brand',
  );
}
