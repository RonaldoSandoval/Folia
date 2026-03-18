import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Visual size of the spinner ring. */
export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Color variant of the spinner.
 * - `brand`  — uses the primary brand color (default).
 * - `white`  — for use on filled/colored backgrounds.
 * - `muted`  — subtle, low-emphasis loading indicator.
 */
export type SpinnerColor = 'brand' | 'white' | 'muted';

/** Tailwind classes per size variant. */
const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
  xl: 'w-12 h-12 border-4',
};

/** Tailwind text-color classes per color variant (ring inherits via `border-current`). */
const COLOR_CLASSES: Record<SpinnerColor, string> = {
  brand: 'text-brand',
  white: 'text-white',
  muted: 'text-muted',
};

/**
 * Reusable loading spinner.
 *
 * Renders an accessible, animated ring that adapts to the active color theme
 * (including dark mode) via the app's design tokens.
 *
 * @example
 * <!-- default: brand color, medium size -->
 * <app-spinner />
 *
 * @example
 * <!-- large white spinner with custom label -->
 * <app-spinner size="lg" color="white" label="Compiling document..." />
 */
@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner {
  /** Controls the diameter and border thickness of the ring. Defaults to `'md'`. */
  size = input<SpinnerSize>('md');

  /** Controls the ring color using a design-token alias. Defaults to `'brand'`. */
  color = input<SpinnerColor>('brand');

  /** Accessible label announced by screen readers. */
  label = input<string>('Loading...');

  /** Resolved Tailwind class string for the spinning ring element. */
  protected readonly ringClasses = computed(
    () =>
      `rounded-full animate-spin border-current border-t-transparent ${SIZE_CLASSES[this.size()]} ${COLOR_CLASSES[this.color()]}`,
  );
}
