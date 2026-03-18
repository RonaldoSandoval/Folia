import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CompilerService } from '../../core/service/compiler/compiler-service';
import { DocumentService } from '../../core/service/document/document.service';
import { ChatPanel } from './components/chat-panel/chat-panel';
import { EditorHeader } from './components/editor-header/editor-header';
import { EditorPanel } from './components/editor-panel/editor-panel';
import { FilesSidebar, type ImageFile } from './components/files-sidebar/files-sidebar';
import { PreviewPanel } from './components/preview-panel/preview-panel';

/** Minimum and maximum editor width as a percentage of the resize container. */
const MIN_EDITOR_PCT = 20;
const MAX_EDITOR_PCT = 80;

/** Debounce delay before triggering a Typst compile (ms). */
const COMPILE_DEBOUNCE_MS = 150;

/**
 * Full-screen project editor page.
 *
 * Layout (top → bottom, left → right):
 *   EditorHeader (sticky top bar with back, title, compile indicator, save, chat toggle)
 *   ├── FilesSidebar (collapsible left panel)
 *   ├── EditorPanel  ──── resize handle ──── PreviewPanel
 *   └── ChatPanel (overlay sidebar, toggled via header button)
 *
 * CompilerService is provided at this component level so the Web Worker is only
 * created when the editor is actually opened, not at application bootstrap.
 */
@Component({
  selector: 'app-editor-page',
  imports: [
    EditorHeader,
    FilesSidebar,
    EditorPanel,
    PreviewPanel,
    ChatPanel,
  ],
  providers: [CompilerService],
  templateUrl: './editor-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage implements OnInit, OnDestroy {
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly compiler        = inject(CompilerService);
  private readonly documentService = inject(DocumentService);

  private compileTimer: ReturnType<typeof setTimeout> | null = null;

  /** Document ID from the route param. */
  readonly documentId = this.route.snapshot.paramMap.get('id') ?? '';

  /** localStorage key for the unsaved draft of this document. */
  private get draftKey(): string { return `typs_draft_${this.documentId}`; }

  // ── Panel visibility ───────────────────────────────────────────────────────

  readonly filesOpen = signal(true);
  readonly chatOpen  = signal(false);

  // ── Editor content ─────────────────────────────────────────────────────────

  readonly content       = signal('');
  readonly compiling     = signal(false);
  readonly compileError  = signal<string | null>(null);
  readonly vectorData    = signal<Uint8Array | null>(null);
  readonly documentTitle = signal('Sin título');
  readonly saveStatus    = signal<'guardado' | 'guardando' | 'sin-guardar'>('guardado');
  readonly projectFiles  = signal<{ name: string; content: string }[]>([]);
  readonly activeFile    = signal('main.typ');

  /**
   * Images registered in the Typst compiler virtual filesystem.
   * Each entry contains the display/reference name, a blob URL for thumbnails,
   * and the raw bytes (needed to re-register under a new name on rename).
   */
  readonly imageFiles = signal<(ImageFile & { data: Uint8Array })[]>([]);

  /** Reference to the EditorPanel child — used to call `setContent()` imperatively. */
  private readonly editorPanel = viewChild(EditorPanel);

  ngOnInit(): void {
    this.initDocument();
  }

  private async initDocument(): Promise<void> {
    // Try cache first; fall back to a direct Supabase fetch (e.g. on page refresh).
    const doc =
      this.documentService.getById(this.documentId) ??
      (await this.documentService.fetchById(this.documentId));

    if (!doc) {
      this.router.navigate(['/app']);
      return;
    }

    // Prefer the localStorage draft (written on every keystroke) over the
    // Supabase content (written only on manual save). Recovers unsaved work
    // after a page refresh.
    const draft   = localStorage.getItem(this.draftKey);
    const initial = draft ?? doc.content;

    this.content.set(initial);
    this.documentTitle.set(doc.title);
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
    if (draft) this.saveStatus.set('sin-guardar');

    // Populate the editor imperatively — no @if mount/unmount needed.
    this.editorPanel()?.setContent(initial);
    this.triggerCompile(initial);
  }

  ngOnDestroy(): void {
    if (this.compileTimer !== null) clearTimeout(this.compileTimer);
    for (const img of this.imageFiles()) URL.revokeObjectURL(img.previewUrl);
  }

  onContentChange(source: string): void {
    this.content.set(source);
    this.saveStatus.set('sin-guardar');

    // Persist draft locally on every keystroke — no Supabase request.
    localStorage.setItem(this.draftKey, source);

    // Debounce: compile 150ms after last keystroke.
    if (this.compileTimer !== null) clearTimeout(this.compileTimer);
    this.compiling.set(true);
    this.compileTimer = setTimeout(() => {
      this.compileTimer = null;
      this.triggerCompile(source);
    }, COMPILE_DEBOUNCE_MS);
  }

  saveDocument(): void {
    this.saveStatus.set('guardando');
    this.documentService.saveContent(this.documentId, this.content()).then(() => {
      this.saveStatus.set('guardado');
      // Draft confirmed in Supabase — no longer needed locally.
      localStorage.removeItem(this.draftKey);
    });
  }

  private async triggerCompile(source: string): Promise<void> {
    this.compiling.set(true);
    try {
      const data = await this.compiler.compile(source);
      this.vectorData.set(data);
      this.compileError.set(null);
      this.compiling.set(false);
    } catch (err) {
      // Silently ignore cancellations — a newer compile is already in flight.
      if (err instanceof Error && err.message.startsWith('Cancelled')) return;
      console.error('[Typst] Compile error:', err);
      this.compileError.set(err instanceof Error ? err.message : String(err));
      this.compiling.set(false);
    }
  }

  // ── Panel resize ───────────────────────────────────────────────────────────

  readonly editorWidthPct = signal(50);

  private readonly resizeContainer =
    viewChild<ElementRef<HTMLDivElement>>('resizeContainer');

  startResize(event: MouseEvent): void {
    event.preventDefault();

    const container = this.resizeContainer()?.nativeElement;
    if (!container) return;

    const containerWidth = container.getBoundingClientRect().width;
    const startX   = event.clientX;
    const startPct = this.editorWidthPct();

    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: MouseEvent): void => {
      const delta  = e.clientX - startX;
      const newPct = startPct + (delta / containerWidth) * 100;
      this.editorWidthPct.set(
        Math.min(MAX_EDITOR_PCT, Math.max(MIN_EDITOR_PCT, newPct)),
      );
    };

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/app']);
  }

  download(): void {
    const blob = new Blob([this.content()], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.documentId}.typ`;
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleChat(): void {
    this.chatOpen.update((v) => !v);
  }

  toggleFile(): void {
    this.filesOpen.update((v) => !v);
  }

  /** Appends AI-generated content to the end of the editor. */
  appendToContent(text: string): void {
    const updated = `${this.content()}\n\n${text}`;
    this.content.set(updated);
    this.editorPanel()?.setContent(updated);
  }

  // ── File management ────────────────────────────────────────────────────────

  async onFileSelect(fileName: string): Promise<void> {
    await this.documentService.switchFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    // Update all state, then push the new content directly into CodeMirror.
    this.activeFile.set(fileName);
    this.content.set(doc.content);
    this.projectFiles.set(doc.files);
    this.editorPanel()?.setContent(doc.content);
    this.triggerCompile(doc.content);
  }

  async onFileCreate(): Promise<void> {
    const name = window.prompt('Nombre del archivo (ej: bibliography.typ)');
    if (!name?.trim()) return;
    const fileName = name.trim().endsWith('.typ') ? name.trim() : `${name.trim()}.typ`;
    await this.documentService.addFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (doc) this.projectFiles.set(doc.files);
  }

  onImageUpload(file: { name: string; data: Uint8Array }): void {
    const previewUrl = URL.createObjectURL(new Blob([file.data.buffer as ArrayBuffer]));

    // Replace if an image with the same name was already uploaded.
    const existing = this.imageFiles().find((i) => i.name === file.name);
    if (existing) URL.revokeObjectURL(existing.previewUrl);

    this.imageFiles.update((imgs) => [
      ...imgs.filter((i) => i.name !== file.name),
      { name: file.name, previewUrl, data: file.data },
    ]);

    this.compiler.addFile(`/${file.name}`, file.data);
    this.triggerCompile(this.content());
  }

  onImageRename(event: { oldName: string; newName: string }): void {
    const { oldName, newName } = event;
    const img = this.imageFiles().find((i) => i.name === oldName);
    if (!img) return;

    // Re-register under the new path; remove the old one.
    this.compiler.removeFile(`/${oldName}`);
    this.compiler.addFile(`/${newName}`, img.data);

    this.imageFiles.update((imgs) =>
      imgs.map((i) => (i.name === oldName ? { ...i, name: newName } : i)),
    );

    this.triggerCompile(this.content());
  }

  onImageDelete(name: string): void {
    const img = this.imageFiles().find((i) => i.name === name);
    if (!img) return;

    URL.revokeObjectURL(img.previewUrl);
    this.compiler.removeFile(`/${name}`);
    this.imageFiles.update((imgs) => imgs.filter((i) => i.name !== name));
    this.triggerCompile(this.content());
  }

  async onFileDelete(fileName: string): Promise<void> {
    if (!window.confirm(`¿Eliminar "${fileName}"?`)) return;
    await this.documentService.deleteFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
    const newContent = doc.content;
    this.content.set(newContent);
    this.editorPanel()?.setContent(newContent);
  }
}
