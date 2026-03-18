import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Native input types supported by the text field. */
export type TextFieldType = 'text' | 'email' | 'password' | 'search' | 'url';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable single-line text input.
 *
 * Uses `model()` for two-way binding so the parent can write
 * `[(value)]="mySignal"` without a separate `(valueChange)` handler.
 *
 * An optional leading icon and an optional error message are supported.
 * All colors come from the design-token layer so dark mode works without
 * extra configuration.
 *
 * @example
 * ```html
 * <!-- Basic -->
 * <app-text-field [(value)]="query" placeholder="Search…" [icon]="SearchIcon" />
 *
 * <!-- With label and error -->
 * <app-text-field
 *   label="Email"
 *   type="email"
 *   [(value)]="email"
 *   [error]="emailError()"
 * />
 * ```
 */
@Component({
  selector: 'app-text-field',
  imports: [LucideAngularModule],
  templateUrl: './text-field.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextField {
  /** Two-way bound value of the input. */
  value = model<string>('');

  /** Visible label rendered above the input. Hidden when empty. */
  label = input<string>('');

  /** Placeholder text shown when the input is empty. */
  placeholder = input<string>('');

  /** Native input `type` attribute. Defaults to `'text'`. */
  type = input<TextFieldType>('text');

  /** Optional Lucide icon rendered inside the left edge of the input. */
  icon = input<LucideIconData | null>(null);

  /** Error message rendered below the input. Puts the input into error state. */
  error = input<string>('');

  /** When `true`, the input is non-interactive and visually dimmed. */
  disabled = input<boolean>(false);

  /** Whether the field currently has an error. */
  protected readonly hasError = computed(() => this.error().length > 0);

  /** Class string for the native `<input>` element. */
  protected readonly inputClasses = computed(() => {
  const base = [
    'w-full h-10 rounded-lg border bg-surface text-foreground text-sm',
    'placeholder:text-muted',
    'transition-colors duration-200',
    'focus:outline-none focus:ring-2 focus:border-transparent',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    this.icon() ? 'pl-12 pr-4' : 'px-4',
  ];

    if (this.hasError()) {
      base.push('border-danger focus:ring-danger');
    } else {
      base.push('border-border focus:ring-brand');
    }

    return base.join(' ');
  });

  /** Propagates native input events to the `value` model signal. */
  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
