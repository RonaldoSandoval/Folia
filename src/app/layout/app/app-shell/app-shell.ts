import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ArrowDownAZ,
  ChevronDown,
  Clock,
  FolderPlus,
  ListFilter,
  LucideAngularModule,
  Plus,
  Search,
} from 'lucide-angular';
import type { FolderItem } from '../../../core/service/document/document.service';
import { DocumentService } from '../../../core/service/document/document.service';
import { Button } from '../../../shared/components/button/button';
import { ConfirmDeleteDialog } from '../../../shared/components/confirm-delete-dialog/confirm-delete-dialog';
import { CreateDocumentDialog } from '../../../shared/components/create-document-dialog/create-document-dialog';
import { DocumentItem } from '../../../shared/components/document-list/document-list';
import { Dropdown, DropdownItem } from '../../../shared/components/dropdown/dropdown';
import { RenameDialog } from '../../../shared/components/rename-dialog/rename-dialog';
import { TextField } from '../../../shared/components/text-field/text-field';
import { DocMoveEvent, WorkspaceView } from '../../../shared/components/workspace-view/workspace-view';
import { Spinner } from '../../../shared/components/spinner/spinner';

export type { DocumentItem };
export type SortOrder = 'recent' | 'oldest' | 'name';

@Component({
  selector: 'app-shell',
  imports: [
    LucideAngularModule,
    Button,
    TextField,
    Dropdown,
    RenameDialog,
    ConfirmDeleteDialog,
    CreateDocumentDialog,
    WorkspaceView,
    Spinner,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell {
  protected readonly Plus        = Plus;
  protected readonly Search      = Search;
  protected readonly ListFilter  = ListFilter;
  protected readonly ChevronDown = ChevronDown;
  protected readonly FolderPlus  = FolderPlus;

  private readonly router              = inject(Router);
  protected readonly documentService   = inject(DocumentService);

  // ── Folder navigation ─────────────────────────────────────────────────────

  readonly currentFolderId = signal<string | null>(null);

  /** Ordered path from root to current folder (for breadcrumb). */
  readonly currentPath = computed<FolderItem[]>(() => {
    const folderId = this.currentFolderId();
    if (!folderId) return [];

    const folderMap = new Map(this.documentService.folders().map((f) => [f.id, f]));
    const path: FolderItem[] = [];
    let current = folderMap.get(folderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folderMap.get(current.parentId) : undefined;
    }
    return path;
  });

  navigateToFolder(id: string | null): void {
    this.currentFolderId.set(id);
  }

  // ── Async processing flag ─────────────────────────────────────────────────

  readonly isProcessing = signal(false);

  /** Array used to render skeleton cards while loading. */
  readonly skeletonItems = Array.from({ length: 8 }, (_, i) => i);

  // ── Dialog state ──────────────────────────────────────────────────────────

  readonly showCreateDialog       = signal(false);
  readonly showCreateFolderDialog = signal(false);
  readonly renameTarget           = signal<DocumentItem | null>(null);
  readonly deleteTarget           = signal<DocumentItem | null>(null);
  readonly renameFolderTarget     = signal<FolderItem | null>(null);
  readonly deleteFolderTarget     = signal<FolderItem | null>(null);
  readonly deleteFolderDocCount   = signal(0);

  // ── Document actions ──────────────────────────────────────────────────────

  createDocument(): void { this.showCreateDialog.set(true); }

  async confirmCreate(title: string): Promise<void> {
    this.showCreateDialog.set(false);
    this.isProcessing.set(true);
    await this.documentService.create(title, this.currentFolderId());
    this.isProcessing.set(false);
  }

  openDocument(doc: DocumentItem): void {
    this.router.navigate(['/project', doc.id]);
  }

  renameDocument(doc: DocumentItem): void { this.renameTarget.set(doc); }

  confirmRename(newTitle: string): void {
    const target = this.renameTarget();
    if (target) this.documentService.rename(target.id, newTitle);
    this.renameTarget.set(null);
  }

  deleteDocument(doc: DocumentItem): void { this.deleteTarget.set(doc); }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    this.deleteTarget.set(null);
    if (!target) return;
    this.isProcessing.set(true);
    await this.documentService.delete(target.id);
    this.isProcessing.set(false);
  }

  moveDocument(event: DocMoveEvent): void {
    this.documentService.moveDocument(event.doc.id, event.folderId);
  }

  // ── Folder actions ────────────────────────────────────────────────────────

  createFolder(): void { this.showCreateFolderDialog.set(true); }

  confirmCreateFolder(name: string): void {
    this.showCreateFolderDialog.set(false);
    this.documentService.createFolder(name, this.currentFolderId());
  }

  openFolder(folder: FolderItem): void { this.currentFolderId.set(folder.id); }

  renameFolderPrompt(folder: FolderItem): void { this.renameFolderTarget.set(folder); }

  confirmFolderRename(newName: string): void {
    const target = this.renameFolderTarget();
    if (target) this.documentService.renameFolder(target.id, newName);
    this.renameFolderTarget.set(null);
  }

  deleteFolderPrompt(folder: FolderItem): void {
    this.deleteFolderTarget.set(folder);
    // Pre-compute how many documents will be deleted so the dialog can warn the user.
    const folderIds = this.collectFolderSubtree(folder.id);
    const count = this.documentService.documents().filter(
      (d) => !!d.folderId && folderIds.includes(d.folderId),
    ).length;
    this.deleteFolderDocCount.set(count);
  }

  /** Recursively collects a folder ID and all its descendant IDs. */
  private collectFolderSubtree(folderId: string): string[] {
    const result = [folderId];
    for (const child of this.documentService.folders().filter((f) => f.parentId === folderId)) {
      result.push(...this.collectFolderSubtree(child.id));
    }
    return result;
  }

  async confirmFolderDelete(): Promise<void> {
    const target = this.deleteFolderTarget();
    this.deleteFolderTarget.set(null);
    if (!target) return;
    this.isProcessing.set(true);
    await this.documentService.deleteFolder(target.id);
    this.isProcessing.set(false);
  }

  // ── Search & sort ─────────────────────────────────────────────────────────

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

  onSortChange(item: DropdownItem): void { this.sortOrder.set(item.id as SortOrder); }

  loadMore(): void { void this.documentService.loadMoreDocuments(); }

  // ── Visible items ─────────────────────────────────────────────────────────

  /** Subfolders of the current level (hidden when searching). */
  readonly visibleFolders = computed<FolderItem[]>(() => {
    if (this.searchTerm().trim()) return [];
    return this.documentService.folders().filter(
      (f) => (f.parentId ?? null) === this.currentFolderId(),
    );
  });

  /** Documents for the current view, filtered and sorted. */
  readonly visibleDocuments = computed<DocumentItem[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();

    // When searching: scan all docs across all folders.
    // When browsing: only docs in the current folder.
    let docs = term
      ? this.documentService.documents()
      : this.documentService.documents().filter(
          (d) => (d.folderId ?? null) === this.currentFolderId(),
        );

    if (term) {
      docs = docs.filter((d) => d.title.toLowerCase().includes(term));
    }

    const sorted = [...docs];
    switch (this.sortOrder()) {
      case 'recent': sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); break;
      case 'oldest': sorted.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); break;
      case 'name':   sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
    }
    return sorted;
  });
}
