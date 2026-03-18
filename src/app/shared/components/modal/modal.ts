import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  input,
  output,
  viewChild,
} from '@angular/core';
import { X, LucideAngularModule } from 'lucide-angular';

/**
 * Generic modal overlay.
 *
 * Renders a centered dialog panel over a semi-transparent backdrop.
 * Content is projected via `ng-content`. Closes on:
 *   - Backdrop click
 *   - Escape key
 *   - Explicit `(close)` output handler
 *
 * @example
 * ```html
 * <app-modal title="Renombrar" (close)="closeModal()">
 *   <p>Modal content here</p>
 * </app-modal>
 * ```
 */
@Component({
  selector: 'app-modal',
  imports: [LucideAngularModule],
  templateUrl: './modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal implements OnInit, OnDestroy {
  readonly X = X;

  /** Displayed in the modal header. */
  readonly title = input<string>('');

  /** Emitted when the user requests to close the modal. */
  readonly close = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLDivElement>>('panel');

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close.emit();
  };

  ngOnInit(): void {
    document.addEventListener('keydown', this.onKeydown);
    // Prevent body scroll while modal is open.
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
    document.body.style.overflow = '';
  }

  onBackdropClick(event: MouseEvent): void {
    // Only close if the click landed directly on the backdrop, not on the panel.
    const panel = this.panel()?.nativeElement;
    if (panel && !panel.contains(event.target as Node)) {
      this.close.emit();
    }
  }
}
