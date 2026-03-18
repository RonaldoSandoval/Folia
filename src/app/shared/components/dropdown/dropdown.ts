import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single item rendered inside the dropdown panel.
 *
 * Setting `separator: true` draws a horizontal rule **before** the item,
 * making it easy to group related actions without needing extra wrapper elements.
 */
export interface DropdownItem {
  /** Unique identifier — used as the `track` key in `@for`. */
  id: string;
  /** Text label displayed in the row. */
  label: string;
  /** Optional Lucide icon placed to the left of the label. */
  icon?: LucideIconData;
  /**
   * Visual / semantic variant.
   * - `'default'` — standard neutral action (default).
   * - `'danger'`  — destructive action; renders in red tones.
   */
  variant?: 'default' | 'danger';
  /** When `true` the item is rendered but not interactive. */
  disabled?: boolean;
  /** When `true` a separator line is rendered above this item. */
  separator?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Generic floating dropdown menu.
 *
 * The trigger element is injected via content projection using the `[trigger]`
 * attribute selector. The panel opens on trigger click and closes on an outside
 * click or the `Escape` key.
 *
 * @example
 * ```html
 * <app-dropdown [items]="menuItems" (itemClick)="onAction($event)">
 *   <button trigger>Options</button>
 * </app-dropdown>
 * ```
 */
@Component({
  selector: 'app-dropdown',
  imports: [LucideAngularModule],
  templateUrl: './dropdown.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dropdown {
  private readonly host = inject(ElementRef);

  /** Items to render in the panel. */
  items = input<DropdownItem[]>([]);

  /**
   * Horizontal alignment of the panel relative to the trigger.
   * - `'right'` — panel's right edge aligns with the trigger (default).
   * - `'left'`  — panel's left edge aligns with the trigger.
   */
  align = input<'left' | 'right'>('right');

  /** Emits the selected item when the user clicks a non-disabled row. */
  itemClick = output<DropdownItem>();

  /** Whether the panel is currently visible. */
  protected readonly isOpen = signal(false);

  /** Toggles the panel open/closed. Called by the trigger wrapper. */
  protected toggle(): void {
    this.isOpen.update((v) => !v);
  }

  /** Handles item selection; ignored for disabled items. */
  protected select(item: DropdownItem): void {
    if (item.disabled) return;
    this.itemClick.emit(item);
    this.isOpen.set(false);
  }

  /** Returns the Tailwind classes for a single item row. */
  protected itemClasses(item: DropdownItem): string {
    if (item.disabled) {
      return 'text-muted cursor-not-allowed opacity-50';
    }
    if (item.variant === 'danger') {
      return 'text-danger-text hover:bg-danger-subtle cursor-pointer';
    }
    return 'text-secondary hover:bg-surface-hover hover:text-foreground cursor-pointer';
  }

  // ---------------------------------------------------------------------------
  // Global event listeners
  // ---------------------------------------------------------------------------

  /** Closes the panel when the user clicks anywhere outside the host element. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  /** Closes the panel when the user presses Escape. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }
}
