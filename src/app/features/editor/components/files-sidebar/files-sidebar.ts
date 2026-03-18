import {
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
  Copy,
  FilePlus,
  FileText,
  ImagePlus,
  LucideAngularModule,
  Trash2,
  X,
} from 'lucide-angular';
import type { ProjectFile } from '../../../../core/service/document/document.service';

export type { ProjectFile };

/**
 * An image file registered in the Typst virtual filesystem.
 * Use the `name` directly in Typst markup: `#image("name")`
 */
export interface ImageFile {
  /** Registered filename — use as-is in `#image("name")`. */
  name: string;
  /** Blob URL for the thumbnail preview (managed by the parent). */
  previewUrl: string;
}

/** Accepted MIME types for image upload. */
const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
].join(',');

/**
 * Left sidebar listing project files and uploaded images.
 *
 * - `.typ` files: click to open, delete button on hover.
 * - Images: thumbnail + filename, double-click to rename inline,
 *   copy button copies `#image("name")` to the clipboard.
 */
@Component({
  selector: 'app-files-sidebar',
  imports: [LucideAngularModule],
  templateUrl: './files-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class FilesSidebar {
  protected readonly FileText  = FileText;
  protected readonly FilePlus  = FilePlus;
  protected readonly ImagePlus = ImagePlus;
  protected readonly Trash2    = Trash2;
  protected readonly Copy      = Copy;
  protected readonly Check     = Check;
  protected readonly X         = X;

  protected readonly ACCEPTED_IMAGE_TYPES = ACCEPTED_IMAGE_TYPES;

  // ── Inputs ─────────────────────────────────────────────────────────────────

  readonly files      = input<ProjectFile[]>([{ name: 'main.typ', content: '' }]);
  readonly activeFile = input<string>('main.typ');
  readonly imageFiles = input<ImageFile[]>([]);

  // ── Outputs ────────────────────────────────────────────────────────────────

  readonly fileSelect  = output<string>();
  readonly fileCreate  = output<void>();
  readonly fileDelete  = output<string>();

  /** Raw bytes + original filename for a newly picked image. */
  readonly imageUpload = output<{ name: string; data: Uint8Array }>();
  /** Rename an already-registered image. */
  readonly imageRename = output<{ oldName: string; newName: string }>();
  /** Remove an image from the virtual filesystem. */
  readonly imageDelete = output<string>();

  // ── Derived ────────────────────────────────────────────────────────────────

  protected readonly isSingleFile = computed(() => this.files().length <= 1);

  // ── Rename state ───────────────────────────────────────────────────────────

  /** Name of the image currently being renamed (null = none). */
  protected readonly renamingName = signal<string | null>(null);
  /** Value of the rename input field. */
  protected readonly renameValue  = signal('');

  private readonly fileInput   = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  /** Tracks the previous image count to detect newly added images. */
  private prevImageCount = 0;

  constructor() {
    // Auto-open rename mode for the most recently uploaded image.
    effect(() => {
      const imgs = this.imageFiles();
      const prev = this.prevImageCount;
      this.prevImageCount = imgs.length;
      if (imgs.length > prev && imgs.length > 0) {
        const newest = imgs[imgs.length - 1];
        // Defer so Angular has rendered the rename input before we focus it.
        setTimeout(() => this.startRename(newest.name));
      }
    });
  }

  // ── File-picker ────────────────────────────────────────────────────────────

  openImagePicker(): void {
    this.fileInput().nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same file

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      this.imageUpload.emit({ name: file.name, data: new Uint8Array(buffer) });
    }
  }

  // ── Inline rename ──────────────────────────────────────────────────────────

  startRename(name: string): void {
    this.renamingName.set(name);
    this.renameValue.set(name);
    // Focus + select the input text after the template renders.
    setTimeout(() => {
      const el = this.renameInput()?.nativeElement;
      if (el) { el.focus(); el.select(); }
    });
  }

  confirmRename(): void {
    const oldName = this.renamingName();
    if (!oldName) return;

    const newName = this.renameValue().trim();
    if (newName && newName !== oldName) {
      this.imageRename.emit({ oldName, newName });
    }
    this.renamingName.set(null);
  }

  cancelRename(): void {
    this.renamingName.set(null);
  }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') { event.preventDefault(); this.confirmRename(); }
    if (event.key === 'Escape') { this.cancelRename(); }
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────

  copyImageSyntax(name: string): void {
    navigator.clipboard.writeText(`#image("${name}")`).catch(() => {});
  }
}
