import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArrowDownAZ, ChevronDown, Clock, ListFilter, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { DocumentService } from '../../../core/service/document/document.service';
import { Button } from '../../../shared/components/button/button';
import { ConfirmDeleteDialog } from '../../../shared/components/confirm-delete-dialog/confirm-delete-dialog';
import { DocumentItem, DocumentList } from '../../../shared/components/document-list/document-list';
import { Dropdown, DropdownItem } from '../../../shared/components/dropdown/dropdown';
import { RenameDialog } from '../../../shared/components/rename-dialog/rename-dialog';
import { TextField } from '../../../shared/components/text-field/text-field';

export type { DocumentItem };

/** Valid sort order keys for the documents list. */
export type SortOrder = 'recent' | 'oldest' | 'name';

@Component({
  selector: 'app-shell',
  imports: [
    LucideAngularModule,
    Button,
    TextField,
    Dropdown,
    DocumentList,
    RenameDialog,
    ConfirmDeleteDialog,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell {
  readonly Plus        = Plus;
  readonly Search      = Search;
  readonly ListFilter  = ListFilter;
  readonly ChevronDown = ChevronDown;

  private readonly router          = inject(Router);
  private readonly documentService = inject(DocumentService);

  // ── Dialog state ──────────────────────────────────────────────────────────

  /** Document currently being renamed, or null when the dialog is closed. */
  readonly renameTarget = signal<DocumentItem | null>(null);

  /** Document pending deletion, or null when the dialog is closed. */
  readonly deleteTarget = signal<DocumentItem | null>(null);

  // ── Actions ───────────────────────────────────────────────────────────────

  createDocument(): void {
    this.documentService.create();
  }

  openDocument(doc: DocumentItem): void {
    this.router.navigate(['/project', doc.id]);
  }

  renameDocument(doc: DocumentItem): void {
    this.renameTarget.set(doc);
  }

  confirmRename(newTitle: string): void {
    const target = this.renameTarget();
    if (target) this.documentService.rename(target.id, newTitle);
    this.renameTarget.set(null); // close dialog immediately (optimistic)
  }

  deleteDocument(doc: DocumentItem): void {
    this.deleteTarget.set(doc);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target) this.documentService.delete(target.id);
    this.deleteTarget.set(null); // close dialog immediately (optimistic)
  }

  // ── Search & sort state ───────────────────────────────────────────────────

  readonly searchTerm = signal('');
  readonly sortOrder  = signal<SortOrder>('recent');

  readonly sortItems: DropdownItem[] = [
    { id: 'recent', label: 'Más recientes', icon: Clock },
    { id: 'oldest', label: 'Más antiguos',  icon: Clock },
    { id: 'name',   label: 'Nombre (A–Z)',  icon: ArrowDownAZ },
  ];

  protected readonly currentSortLabel = computed(
    () => this.sortItems.find((i) => i.id === this.sortOrder())?.label ?? 'Ordenar',
  );

  readonly filteredDocuments = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    let result = term
      ? this.documentService.documents().filter((d) => d.title.toLowerCase().includes(term))
      : [...this.documentService.documents()];

    switch (this.sortOrder()) {
      case 'recent':
        result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        break;
      case 'oldest':
        result.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        break;
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    return result;
  });

  onSortChange(item: DropdownItem): void {
    this.sortOrder.set(item.id as SortOrder);
  }
}
