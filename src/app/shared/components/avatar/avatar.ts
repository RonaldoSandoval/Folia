import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule, LogOut, User } from 'lucide-angular';

/**
 * Circular user avatar with an integrated profile dropdown.
 *
 * Displays the user's initials inside a brand-colored circle. Clicking the
 * avatar opens a panel that shows the user's name and role at the top,
 * followed by "Profile" and "Sign Out" actions.
 *
 * The panel closes on an outside click or the `Escape` key — the same
 * behavior as `app-dropdown`.
 *
 * @example
 * ```html
 * <app-avatar
 *   name="John Doe"
 *   role="Admin"
 *   (profileClick)="goToProfile()"
 *   (signOutClick)="signOut()"
 * />
 * ```
 */
@Component({
  selector: 'app-avatar',
  imports: [LucideAngularModule],
  templateUrl: './avatar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  private readonly host = inject(ElementRef);

  /** Full display name of the user. Initials are derived from this value. */
  name = input<string>('');

  /** Role or subtitle shown below the name inside the dropdown. */
  role = input<string>('');

  /** Emitted when the user clicks the "Profile" menu item. */
  profileClick = output<void>();

  /** Emitted when the user clicks the "Sign Out" menu item. */
  signOutClick = output<void>();

  readonly User = User;
  readonly LogOut = LogOut;

  /** Whether the dropdown panel is currently visible. */
  protected readonly isOpen = signal(false);

  /**
   * One or two uppercase letters extracted from `name`.
   * "John Doe" → "JD", "Alice" → "A", "" → "?"
   */
  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0][0].toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  });

  protected toggle(): void {
    this.isOpen.update((v) => !v);
  }

  protected onProfileClick(): void {
    this.isOpen.set(false);
    this.profileClick.emit();
  }

  protected onSignOutClick(): void {
    this.isOpen.set(false);
    this.signOutClick.emit();
  }

  // ---------------------------------------------------------------------------
  // Global event listeners
  // ---------------------------------------------------------------------------

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }
}
