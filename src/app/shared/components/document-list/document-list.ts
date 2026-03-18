import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  ExternalLink,
  FileText,
  LucideAngularModule,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from 'lucide-angular';
import { Dropdown, DropdownItem } from '../dropdown/dropdown';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single document entry in the user's workspace. */
export interface DocumentItem {
  id: string;
  title: string;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable relative time string for a given date.
 * Favours short formats ("2h ago", "3 days ago") and falls back to a
 * locale date string for anything older than 30 days.
 */
function relativeTime(date: Date): string {
  const diff    = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);

  if (minutes < 1)  return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours   < 24) return `Hace ${hours}h`;
  if (days   === 1) return 'Ayer';
  if (days    < 30) return `Hace ${days} días`;

  return date.toLocaleDateString('es-ES', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a responsive grid of document cards.
 *
 * Handles its own empty state — showing different messages depending on
 * whether the empty list is caused by a search filter or simply because
 * no documents exist yet.
 *
 * Each card emits one of three outputs when the user interacts with the
 * per-card context menu (`documentOpen`, `documentRename`, `documentDelete`).
 * Clicking the card body is a shorthand for `documentOpen`.
 */
@Component({
  selector: 'app-document-list',
  imports: [LucideAngularModule, Dropdown],
  templateUrl: './document-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentList {
  /** Filtered and sorted documents to render. */
  documents = input<DocumentItem[]>([]);

  /**
   * When `true`, the empty state message changes to reflect that the search
   * returned no results rather than that no documents exist yet.
   */
  searchActive = input<boolean>(false);

  /** Emitted when the user clicks a card or the "Open" menu action. */
  documentOpen   = output<DocumentItem>();

  /** Emitted when the user selects the "Rename" menu action. */
  documentRename = output<DocumentItem>();

  /** Emitted when the user selects the "Delete" menu action. */
  documentDelete = output<DocumentItem>();

  // ---------------------------------------------------------------------------
  // Icon refs
  // ---------------------------------------------------------------------------

  readonly FileText      = FileText;
  readonly MoreHorizontal = MoreHorizontal;
  readonly Search        = Search;

  // ---------------------------------------------------------------------------
  // Per-card context menu
  // ---------------------------------------------------------------------------

  /** Context-menu items shown inside each document card. */
  readonly cardMenuItems: DropdownItem[] = [
    { id: 'open',   label: 'Abrir',     icon: ExternalLink },
    { id: 'rename', label: 'Renombrar', icon: Pencil },
    { id: 'delete', label: 'Eliminar',  icon: Trash2, variant: 'danger', separator: true },
  ];

  /** Dispatches the correct output based on the selected menu item. */
  protected onMenuAction(doc: DocumentItem, item: DropdownItem): void {
    switch (item.id) {
      case 'open':   this.documentOpen.emit(doc);   break;
      case 'rename': this.documentRename.emit(doc); break;
      case 'delete': this.documentDelete.emit(doc); break;
    }
  }

  /** Exposes the helper to the template. */
  protected relativeTime = relativeTime;
}
