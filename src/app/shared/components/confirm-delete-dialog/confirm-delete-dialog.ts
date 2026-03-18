import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Trash2, LucideAngularModule } from 'lucide-angular';
import { Modal } from '../modal/modal';
import { Button } from '../button/button';

/**
 * Confirmation dialog for deleting a document.
 *
 * Shows the document name and warns the user that the action is irreversible.
 * Emits `confirm` or `cancel`.
 */
@Component({
  selector: 'app-confirm-delete-dialog',
  imports: [Modal, Button, LucideAngularModule],
  templateUrl: './confirm-delete-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDeleteDialog {
  readonly Trash2 = Trash2;

  /** Name of the document to delete — shown in the confirmation message. */
  readonly documentTitle = input<string>('');

  /** Emitted when the user confirms the deletion. */
  readonly confirm = output<void>();

  /** Emitted when the user cancels. */
  readonly cancel = output<void>();
}
