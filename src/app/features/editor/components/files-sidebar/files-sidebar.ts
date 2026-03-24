import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode,
  FileJson,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  type LucideIconData,
  LucideAngularModule,
  Pencil,
  Trash2,
  X,
} from 'lucide-angular';
import type { ProjectFile } from '../../../../core/service/document/document.service';
import { ConfirmDeleteDialog } from '../../../../shared/components/confirm-delete-dialog/confirm-delete-dialog';

export type { ProjectFile };

/**
 * An image file registered in the Typst virtual filesystem.
 * Use the `name` directly in Typst markup: `#image("name")`
 */
export interface ImageFile {
  name: string;
  previewUrl: string;
}

const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
].join(',');

/**
 * Left sidebar listing project files (organised in folders) and uploaded images.
 *
 * Folder structure is derived from `ProjectFile` entries that have `isFolder: true`.
 * Files inside a folder have their `name` prefixed with the folder path, e.g.
 * `chapters/intro.typ`. This requires no additional DB columns.
 */
@Component({
  selector: 'app-files-sidebar',
  imports: [LucideAngularModule, ConfirmDeleteDialog],
  templateUrl: './files-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class FilesSidebar implements AfterViewChecked {
  // ── Icon refs ──────────────────────────────────────────────────────────────
  protected readonly FileText     = FileText;
  protected readonly FileCode     = FileCode;
  protected readonly FileJson     = FileJson;
  protected readonly FilePlus     = FilePlus;
  protected readonly FolderPlus   = FolderPlus;
  protected readonly Folder       = Folder;
  protected readonly FolderOpen   = FolderOpen;
  protected readonly ChevronDown  = ChevronDown;
  protected readonly ChevronRight = ChevronRight;
  protected readonly ImagePlus    = ImagePlus;
  protected readonly Trash2       = Trash2;
  protected readonly Pencil       = Pencil;
  protected readonly Copy         = Copy;
  protected readonly Check        = Check;
  protected readonly X            = X;

  protected readonly ACCEPTED_IMAGE_TYPES = ACCEPTED_IMAGE_TYPES;

  // ── Inputs ─────────────────────────────────────────────────────────────────

  readonly files      = input<ProjectFile[]>([{ name: 'main.typ', content: '' }]);
  readonly activeFile = input<string>('main.typ');
  readonly imageFiles = input<ImageFile[]>([]);

  // ── Outputs ────────────────────────────────────────────────────────────────

  readonly fileSelect  = output<string>();
  readonly fileCreate  = output<string>();
  readonly fileRename  = output<{ oldName: string; newName: string }>();
  readonly fileDelete  = output<string>();

  readonly folderCreate = output<string>();
  readonly folderRename = output<{ oldName: string; newName: string }>();
  readonly folderDelete = output<string>();

  readonly imageUpload = output<{ name: string; data: Uint8Array }>();
  readonly imageRename = output<{ oldName: string; newName: string }>();
  readonly imageDelete = output<string>();

  // ── Derived ────────────────────────────────────────────────────────────────

  /** Folder entries (isFolder: true). */
  protected readonly folders = computed(() => this.files().filter((f) => f.isFolder));

  /** .typ files at the root level (no folder prefix). */
  protected readonly rootFiles = computed(() =>
    this.files().filter((f) => !f.isFolder && !f.name.includes('/')),
  );

  /** True when there is only one .typ source file left (prevents deleting it). */
  protected readonly isSingleFile = computed(
    () => this.files().filter((f) => !f.isFolder).length <= 1,
  );

  /** Returns .typ files that belong to the given folder. */
  protected filesInFolder(folderName: string): ProjectFile[] {
    return this.files().filter(
      (f) => !f.isFolder && f.name.startsWith(`${folderName}/`),
    );
  }

  /** Returns just the filename without the folder prefix. */
  protected basename(name: string): string {
    const idx = name.lastIndexOf('/');
    return idx === -1 ? name : name.slice(idx + 1);
  }

  /** Returns the appropriate icon for a file based on its extension. */
  protected fileIcon(name: string): LucideIconData {
    switch (this.basename(name).slice(this.basename(name).lastIndexOf('.')).toLowerCase()) {
      case '.json':                          return FileJson;
      case '.bib': case '.csl':
      case '.toml': case '.yaml': case '.yml':
      case '.md':  case '.txt':              return FileCode;
      default:                               return FileText;
    }
  }

  /** Returns images that belong to the given folder. */
  protected imagesInFolder(folderName: string): ImageFile[] {
    return this.imageFiles().filter((img) => img.name.startsWith(`${folderName}/`));
  }

  /** Images at the root level (no folder prefix). */
  protected readonly rootImages = computed(() =>
    this.imageFiles().filter((img) => !img.name.includes('/')),
  );

  // ── Collapse state ─────────────────────────────────────────────────────────

  protected readonly collapsedFolders = signal<Set<string>>(new Set());

  protected isFolderCollapsed(name: string): boolean {
    return this.collapsedFolders().has(name);
  }

  protected toggleFolder(name: string): void {
    this.collapsedFolders.update((s) => {
      const next = new Set(s);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // ── Root .typ file: inline create ──────────────────────────────────────────

  protected readonly isCreating  = signal(false);
  protected readonly newFileName = signal('');

  /** null = root; folder name = create inside that folder */
  protected readonly creatingInFolder = signal<string | null>(null);
  protected readonly newFileInFolder  = signal('');

  private pendingRootCreateFocus     = false;
  private pendingInFolderCreateFocus = false;

  openCreateForm(): void {
    this.cancelCreateInFolder();
    this.newFileName.set('');
    this.isCreating.set(true);
    this.pendingRootCreateFocus = true;
  }

  confirmCreate(): void {
    const raw = this.newFileName().trim();
    if (!raw) { this.isCreating.set(false); return; }
    const name = raw.includes('.') ? raw : `${raw}.typ`;
    this.fileCreate.emit(name);
    this.isCreating.set(false);
    this.newFileName.set('');
  }

  cancelCreate(): void {
    this.isCreating.set(false);
    this.newFileName.set('');
  }

  onCreateKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmCreate(); }
    if (event.key === 'Escape') { this.cancelCreate(); }
  }

  // ── In-folder .typ file: inline create ────────────────────────────────────

  openCreateInFolder(folderName: string): void {
    this.cancelCreate();
    this.cancelCreateFolder();
    this.newFileInFolder.set('');
    this.creatingInFolder.set(folderName);
    // Expand the folder so the input is visible.
    this.collapsedFolders.update((s) => { const n = new Set(s); n.delete(folderName); return n; });
    this.pendingInFolderCreateFocus = true;
  }

  confirmCreateInFolder(): void {
    const folder = this.creatingInFolder();
    if (!folder) return;
    const raw = this.newFileInFolder().trim();
    if (!raw) { this.creatingInFolder.set(null); return; }
    const fileName = raw.includes('.') ? raw : `${raw}.typ`;
    this.fileCreate.emit(`${folder}/${fileName}`);
    this.creatingInFolder.set(null);
    this.newFileInFolder.set('');
  }

  cancelCreateInFolder(): void {
    this.creatingInFolder.set(null);
    this.newFileInFolder.set('');
  }

  onCreateInFolderKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmCreateInFolder(); }
    if (event.key === 'Escape') { this.cancelCreateInFolder(); }
  }

  // ── .typ file rename ───────────────────────────────────────────────────────

  protected readonly renamingFile    = signal<string | null>(null);
  protected readonly renameFileValue = signal('');

  startFileRename(name: string): void {
    this.renamingFile.set(name);
    this.renameFileValue.set(this.basename(name));
    setTimeout(() => {
      const el = this.fileRenameInput()?.nativeElement;
      if (el) { el.focus(); el.select(); }
    });
  }

  confirmFileRename(): void {
    const oldName = this.renamingFile();
    if (!oldName) return;
    const newBasename = this.renameFileValue().trim();
    if (!newBasename) { this.renamingFile.set(null); return; }
    const withExt  = newBasename.includes('.') ? newBasename : `${newBasename}.typ`;
    const folder   = oldName.includes('/') ? oldName.slice(0, oldName.lastIndexOf('/') + 1) : '';
    const newName  = `${folder}${withExt}`;
    if (newName !== oldName) this.fileRename.emit({ oldName, newName });
    this.renamingFile.set(null);
  }

  cancelFileRename(): void { this.renamingFile.set(null); }

  onFileRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmFileRename(); }
    if (event.key === 'Escape') { this.cancelFileRename(); }
  }

  // ── Folder create ──────────────────────────────────────────────────────────

  protected readonly isCreatingFolder = signal(false);
  protected readonly newFolderName    = signal('');

  private pendingFolderCreateFocus = false;

  openCreateFolder(): void {
    this.cancelCreate();
    this.cancelCreateInFolder();
    this.newFolderName.set('');
    this.isCreatingFolder.set(true);
    this.pendingFolderCreateFocus = true;
  }

  confirmCreateFolder(): void {
    const name = this.newFolderName().trim();
    if (name) this.folderCreate.emit(name);
    this.isCreatingFolder.set(false);
    this.newFolderName.set('');
  }

  cancelCreateFolder(): void {
    this.isCreatingFolder.set(false);
    this.newFolderName.set('');
  }

  onCreateFolderKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmCreateFolder(); }
    if (event.key === 'Escape') { this.cancelCreateFolder(); }
  }

  // ── File delete confirmation ──────────────────────────────────────────────

  protected readonly deletingFile = signal<string | null>(null);

  requestFileDelete(fileName: string): void {
    this.deletingFile.set(fileName);
  }

  confirmFileDelete(): void {
    const name = this.deletingFile();
    if (name) this.fileDelete.emit(name);
    this.deletingFile.set(null);
  }

  // ── Folder delete confirmation ────────────────────────────────────────────

  /** Folder name pending deletion — drives the confirmation dialog. */
  protected readonly deletingFolder = signal<string | null>(null);

  requestFolderDelete(folderName: string): void {
    this.deletingFolder.set(folderName);
  }

  confirmFolderDelete(): void {
    const name = this.deletingFolder();
    if (name) this.folderDelete.emit(name);
    this.deletingFolder.set(null);
  }

  // ── Folder rename ──────────────────────────────────────────────────────────

  protected readonly renamingFolder    = signal<string | null>(null);
  protected readonly renameFolderValue = signal('');

  startFolderRename(name: string): void {
    this.renamingFolder.set(name);
    this.renameFolderValue.set(name);
    setTimeout(() => {
      const el = this.folderRenameInput()?.nativeElement;
      if (el) { el.focus(); el.select(); }
    });
  }

  confirmFolderRename(): void {
    const oldName = this.renamingFolder();
    if (!oldName) return;
    const newName = this.renameFolderValue().trim();
    if (newName && newName !== oldName) this.folderRename.emit({ oldName, newName });
    this.renamingFolder.set(null);
  }

  cancelFolderRename(): void { this.renamingFolder.set(null); }

  onFolderRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmFolderRename(); }
    if (event.key === 'Escape') { this.cancelFolderRename(); }
  }

  // ── View children ──────────────────────────────────────────────────────────

  private readonly fileInput          = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly renameInput        = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private readonly fileRenameInput    = viewChild<ElementRef<HTMLInputElement>>('fileRenameInput');
  private readonly folderRenameInput  = viewChild<ElementRef<HTMLInputElement>>('folderRenameInput');
  private readonly createInput        = viewChild<ElementRef<HTMLInputElement>>('createInput');
  private readonly createFolderInput  = viewChild<ElementRef<HTMLInputElement>>('createFolderInput');
  private readonly createInFolderInput = viewChild<ElementRef<HTMLInputElement>>('createInFolderInput');

  // ── AfterViewChecked — auto-focus pending inputs ───────────────────────────

  private prevImageCount = 0;

  constructor() {
    effect(() => {
      const imgs = this.imageFiles();
      const prev = this.prevImageCount;
      this.prevImageCount = imgs.length;
      if (imgs.length > prev && imgs.length > 0) {
        setTimeout(() => this.startRename(imgs[imgs.length - 1].name));
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.pendingRootCreateFocus) {
      const el = this.createInput()?.nativeElement;
      if (el) { el.focus(); this.pendingRootCreateFocus = false; }
    }
    if (this.pendingFolderCreateFocus) {
      const el = this.createFolderInput()?.nativeElement;
      if (el) { el.focus(); this.pendingFolderCreateFocus = false; }
    }
    if (this.pendingInFolderCreateFocus) {
      const el = this.createInFolderInput()?.nativeElement;
      if (el) { el.focus(); this.pendingInFolderCreateFocus = false; }
    }
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  /** When set, uploaded images are placed inside this folder path. */
  private readonly uploadingToFolder = signal<string | null>(null);

  openImagePicker(): void {
    this.uploadingToFolder.set(null);
    this.fileInput().nativeElement.click();
  }

  openImagePickerInFolder(folderName: string): void {
    this.uploadingToFolder.set(folderName);
    this.fileInput().nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input  = event.target as HTMLInputElement;
    const files  = Array.from(input.files ?? []);
    const folder = this.uploadingToFolder();
    input.value  = '';
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const name   = folder ? `${folder}/${file.name}` : file.name;
      this.imageUpload.emit({ name, data: new Uint8Array(buffer) });
    }
    this.uploadingToFolder.set(null);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  protected readonly draggingItem   = signal<{ type: 'file' | 'image'; name: string } | null>(null);
  protected readonly dragOverFolder = signal<string | null>(null);
  protected readonly dragOverRoot   = signal(false);

  protected onItemDragStart(event: DragEvent, type: 'file' | 'image', name: string): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', name);
    }
    setTimeout(() => this.draggingItem.set({ type, name }), 0);
  }

  protected onItemDragEnd(): void {
    this.draggingItem.set(null);
    this.dragOverFolder.set(null);
    this.dragOverRoot.set(false);
  }

  protected onFolderDragOver(event: DragEvent, folderName: string): void {
    if (!this.draggingItem()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverFolder.set(folderName);
  }

  protected onFolderDragLeave(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (!el.contains(event.relatedTarget as Node)) {
      this.dragOverFolder.set(null);
    }
  }

  protected onFolderDrop(event: DragEvent, folderName: string): void {
    event.preventDefault();
    this.moveItem(folderName);
    this.dragOverFolder.set(null);
  }

  protected onRootDragOver(event: DragEvent): void {
    if (!this.draggingItem()) return;
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
    this.moveItem(null);
    this.dragOverRoot.set(false);
  }

  private moveItem(targetFolder: string | null): void {
    const item = this.draggingItem();
    this.draggingItem.set(null);
    if (!item) return;

    const currentFolder = item.name.includes('/')
      ? item.name.slice(0, item.name.lastIndexOf('/'))
      : null;

    if (currentFolder === targetFolder) return; // already there

    const base    = this.basename(item.name);
    const newName = targetFolder ? `${targetFolder}/${base}` : base;

    if (item.type === 'file') {
      this.fileRename.emit({ oldName: item.name, newName });
    } else {
      this.imageRename.emit({ oldName: item.name, newName });
    }
  }

  // ── Image rename ───────────────────────────────────────────────────────────

  protected readonly renamingName = signal<string | null>(null);
  protected readonly renameValue  = signal('');

  startRename(name: string): void {
    this.renamingName.set(name);
    this.renameValue.set(name);
    setTimeout(() => {
      const el = this.renameInput()?.nativeElement;
      if (el) { el.focus(); el.select(); }
    });
  }

  confirmRename(): void {
    const oldName = this.renamingName();
    if (!oldName) return;
    const newName = this.renameValue().trim();
    if (newName && newName !== oldName) this.imageRename.emit({ oldName, newName });
    this.renamingName.set(null);
  }

  cancelRename(): void { this.renamingName.set(null); }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.confirmRename(); }
    if (event.key === 'Escape') { this.cancelRename(); }
  }

  copyImageSyntax(name: string): void {
    navigator.clipboard.writeText(`#image("${name}")`).catch(() => {});
  }
}
