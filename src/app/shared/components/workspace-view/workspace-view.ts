import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import {
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Home,
  LucideAngularModule,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Users,
} from 'lucide-angular';
import type { FolderItem } from '../../../core/service/document/document.service';
import type { DocumentItem } from '../document-list/document-list';
import { Dropdown, type DropdownItem } from '../dropdown/dropdown';

/** Emitted when the user wants to move a document to a different folder. */
export interface DocMoveEvent {
  doc: DocumentItem;
  folderId: string | null;
}

/**
 * Mixed grid showing folders and documents for the current workspace level.
 *
 * Folders are rendered first, then documents. Each document card's context
 * menu dynamically includes "Move to…" entries for every available folder
 * so the user never needs a separate dialog.
 */
@Component({
  selector: 'app-workspace-view',
  imports: [LucideAngularModule, Dropdown],
  templateUrl: './workspace-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceView {
  // ── Inputs ──────────────────────────────────────────────────────────────

  /** Folders to show (already filtered to current level by the parent). */
  readonly folders      = input<FolderItem[]>([]);

  /** Documents to show (already filtered + sorted by the parent). */
  readonly documents    = input<DocumentItem[]>([]);

  /** All folders in the workspace (used to build the move-to menu). */
  readonly allFolders   = input<FolderItem[]>([]);

  /** True when a search query is active — adjusts the empty-state message. */
  readonly searchActive = input(false);

  // ── Outputs ─────────────────────────────────────────────────────────────

  readonly folderOpen   = output<FolderItem>();
  readonly folderRename = output<FolderItem>();
  readonly folderDelete = output<FolderItem>();

  readonly docOpen      = output<DocumentItem>();
  readonly docRename    = output<DocumentItem>();
  readonly docDelete    = output<DocumentItem>();
  readonly docMove      = output<DocMoveEvent>();

  // ── Icon refs ────────────────────────────────────────────────────────────

  protected readonly FileText       = FileText;
  protected readonly Folder         = Folder;
  protected readonly FolderOpen     = FolderOpen;
  protected readonly Home           = Home;
  protected readonly Users          = Users;
  protected readonly MoreHorizontal = MoreHorizontal;
  protected readonly Search         = Search;

  // ── Folder context menu (dynamic per-folder) ─────────────────────────────

  protected getFolderMenuItems(folder: FolderItem): DropdownItem[] {
    if (!folder.isOwned) return [];
    return [
      { id: 'rename', label: 'Renombrar', icon: Pencil },
      { id: 'delete', label: 'Eliminar',  icon: Trash2, variant: 'danger', separator: true },
    ];
  }

  protected onFolderMenuAction(folder: FolderItem, item: DropdownItem): void {
    if (item.id === 'rename') this.folderRename.emit(folder);
    if (item.id === 'delete') this.folderDelete.emit(folder);
  }

  // ── Document context menu (dynamic per-doc) ───────────────────────────────

  protected getDocMenuItems(doc: DocumentItem): DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'open', label: 'Abrir', icon: ExternalLink },
    ];
    if (doc.isOwned !== false) {
      items.push({ id: 'rename', label: 'Renombrar', icon: Pencil });
    }
    items.push({ id: 'delete', label: 'Eliminar', icon: Trash2, variant: 'danger', separator: true });
    return items;
  }

  protected onDocMenuAction(doc: DocumentItem, item: DropdownItem): void {
    if (item.id === 'open')   { this.docOpen.emit(doc);   return; }
    if (item.id === 'rename') { this.docRename.emit(doc); return; }
    if (item.id === 'delete') { this.docDelete.emit(doc); return; }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  protected readonly draggingDoc      = signal<DocumentItem | null>(null);
  protected readonly dragOverFolderId = signal<string | null>(null);
  protected readonly dragOverRoot     = signal(false);

  protected onDragStart(event: DragEvent, doc: DocumentItem): void {
    if (doc.isOwned === false) { event.preventDefault(); return; }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', doc.id);
    }
    // Delay so the browser captures the ghost image before the card dims.
    setTimeout(() => this.draggingDoc.set(doc), 0);
  }

  protected onDragEnd(): void {
    this.draggingDoc.set(null);
    this.dragOverFolderId.set(null);
    this.dragOverRoot.set(false);
  }

  protected onFolderDragOver(event: DragEvent, folder: FolderItem): void {
    if (!this.draggingDoc()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverFolderId.set(folder.id);
  }

  protected onFolderDragLeave(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (!el.contains(event.relatedTarget as Node)) {
      this.dragOverFolderId.set(null);
    }
  }

  protected onFolderDrop(event: DragEvent, folder: FolderItem): void {
    event.preventDefault();
    const doc = this.draggingDoc();
    if (doc && doc.folderId !== folder.id) {
      this.docMove.emit({ doc, folderId: folder.id });
    }
    this.draggingDoc.set(null);
    this.dragOverFolderId.set(null);
  }

  protected onRootDragOver(event: DragEvent): void {
    if (!this.draggingDoc()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverRoot.set(true);
  }

  protected onRootDragLeave(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (!el.contains(event.relatedTarget as Node)) {
      this.dragOverRoot.set(false);
    }
  }

  protected onRootDrop(event: DragEvent): void {
    event.preventDefault();
    const doc = this.draggingDoc();
    if (doc && doc.folderId !== null) {
      this.docMove.emit({ doc, folderId: null });
    }
    this.draggingDoc.set(null);
    this.dragOverRoot.set(false);
  }

  protected get hasContent(): boolean {
    return this.folders().length > 0 || this.documents().length > 0;
  }

  protected relativeTime(date: Date): string {
    const diff    = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours   = Math.floor(diff / 3_600_000);
    const days    = Math.floor(diff / 86_400_000);

    if (minutes < 1)  return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours   < 24) return `Hace ${hours}h`;
    if (days   === 1) return 'Ayer';
    if (days    < 30) return `Hace ${days} días`;

    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
