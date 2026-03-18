import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Modal } from '../modal/modal';
import { Button } from '../button/button';

/**
 * Dialog for renaming a document.
 *
 * Pre-fills the input with the current document title and emits `confirm`
 * with the new name when the user submits. Emits `cancel` when dismissed.
 */
@Component({
  selector: 'app-rename-dialog',
  imports: [Modal, Button],
  templateUrl: './rename-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenameDialog implements OnInit, AfterViewInit {
  /** Current document title — used to pre-fill the input. */
  readonly currentTitle = input<string>('');

  /** Emitted with the new title when the user confirms. */
  readonly confirm = output<string>();

  /** Emitted when the user cancels or closes the dialog. */
  readonly cancel = output<void>();

  readonly newTitle = signal('');

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  ngOnInit(): void {
    this.newTitle.set(this.currentTitle());
  }

  ngAfterViewInit(): void {
    // Auto-focus and select all text so the user can type immediately.
    const el = this.inputRef()?.nativeElement;
    if (el) {
      el.focus();
      el.select();
    }
  }

  submit(): void {
    const trimmed = this.newTitle().trim();
    if (!trimmed) return;
    this.confirm.emit(trimmed);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submit();
    }
  }
}
