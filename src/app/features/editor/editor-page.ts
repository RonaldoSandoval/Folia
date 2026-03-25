import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { createTypstRenderer } from '@myriaddreamin/typst.ts';
import { AssetService } from '../../core/service/asset/asset.service';
import * as Y from 'yjs';
import { CompilerService, CompileError, type DiagnosticMessage } from '../../core/service/compiler/compiler-service';
import { AiService } from '../../core/service/ai/ai.service';
import { SYSTEM_PROMPT, INLINE_PROMPT_ADDENDUM } from '../../core/service/ai/system-prompt';
import { CollaborationService } from '../../core/service/collaboration/collaboration.service';
import { SupabaseYjsProvider, type PresenceUser } from '../../core/service/collaboration/supabase-yjs-provider';
import { DocumentService, type ProjectFile } from '../../core/service/document/document.service';
import { AuthService } from '../../core/service/auth/auth.service';
import { ToastService } from '../../core/service/toast/toast.service';
import { SUPABASE } from '../../core/service/supabase/supabase.client';
import { ChatPanel } from './components/chat-panel/chat-panel';
import { EditorHeader, type DownloadFormat } from './components/editor-header/editor-header';
import { EditorPanel, type YjsBinding } from './components/editor-panel/editor-panel';
import { FilesSidebar, type ImageFile } from './components/files-sidebar/files-sidebar';
import { PreviewPanel } from './components/preview-panel/preview-panel';
import { SharingPanel } from './components/sharing-panel/sharing-panel';
import { Spinner } from '../../shared/components/spinner/spinner';
import { OutlinePanel, type OutlineHeading } from './components/outline-panel/outline-panel';
import { ExportDialog, type ExportSelection } from './components/export-dialog/export-dialog';
import type { RealtimeChannel } from '@supabase/supabase-js';

const RENDERER_OPTIONS = {
  getModule: () => '/assets/typst_ts_renderer_bg.wasm',
  beforeBuild: [] as [],
};

/** Minimum and maximum editor width as a percentage of the resize container. */
const MIN_EDITOR_PCT = 20;
const MAX_EDITOR_PCT = 80;

/** Debounce delay before triggering a Typst compile (ms). */
const COMPILE_DEBOUNCE_MS = 80;

/**
 * Extracts the heading numbering format from `#set heading(numbering: "...")`.
 * Returns null when no numbering is configured.
 */
function detectHeadingNumbering(source: string): string | null {
  const match = source.match(/#set\s+heading[^]*?numbering:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Formats a heading number from level counters and a Typst numbering format string.
 *
 * The format string is split by '1' to extract prefix, inter-level separator,
 * and suffix. Examples:
 *   "1."  counters=[2]   → "2."
 *   "1."  counters=[1,3] → "1.3."
 *   "1.1" counters=[1,3] → "1.3"
 */
function formatHeadingNumber(counters: number[], format: string): string {
  const parts   = format.split('1');
  const prefix  = parts[0];
  const suffix  = parts[parts.length - 1];
  // When format has multiple '1's (e.g. "1.1"), use the char between them as
  // inter-level separator; otherwise fall back to the suffix (e.g. "1." → ".").
  const interSep = parts.length > 2 ? parts[1] : suffix;

  let result = prefix;
  for (let i = 0; i < counters.length; i++) {
    result += counters[i];
    if (i < counters.length - 1) result += interSep;
  }
  return result + suffix;
}

/**
 * Full-screen project editor page.
 *
 * Supports two modes:
 *  - Solo: single-user editing; content stored in localStorage draft + Supabase.
 *  - Collaborative: Yjs drives content via Supabase Realtime Broadcast;
 *    localStorage draft is disabled; Yjs state is periodically persisted to DB.
 */
@Component({
  selector: 'app-editor-page',
  imports: [
    DecimalPipe,
    EditorHeader,
    FilesSidebar,
    OutlinePanel,
    EditorPanel,
    PreviewPanel,
    ChatPanel,
    SharingPanel,
    Spinner,
    ExportDialog,
  ],
  providers: [CompilerService, CollaborationService],
  templateUrl: './editor-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPage implements OnInit, OnDestroy {
  private readonly route                = inject(ActivatedRoute);
  private readonly router               = inject(Router);
  private readonly zone                 = inject(NgZone);
  private readonly compiler             = inject(CompilerService);
  private readonly aiService            = inject(AiService);
  private readonly assetService         = inject(AssetService);
  private readonly documentService      = inject(DocumentService);
  private readonly collaborationService = inject(CollaborationService);
  private readonly auth                 = inject(AuthService);
  private readonly toast                = inject(ToastService);
  private readonly supabase             = inject(SUPABASE);

  private compileTimer:     ReturnType<typeof setTimeout> | null = null;
  private autoSaveTimer:    ReturnType<typeof setTimeout> | null = null;
  private thumbnailTimer:   ReturnType<typeof setTimeout> | null = null;

  /** Debounce delay before auto-saving after the last keystroke (ms). */
  private readonly AUTO_SAVE_DEBOUNCE_MS = 2_000;

  /** Document ID from the route param. */
  readonly documentId = this.route.snapshot.paramMap.get('id') ?? '';

  /** localStorage key for the unsaved draft of this document (solo mode only). */
  private get draftKey(): string { return `typs_draft_${this.documentId}`; }

  // ── Panel visibility ───────────────────────────────────────────────────────

  readonly filesOpen   = signal(true);
  readonly chatOpen    = signal(false);
  readonly sharingOpen = signal(false);
  /** Non-null while the export page-picker dialog is open. */
  readonly exportDialogFormat = signal<'svg' | 'png' | null>(null);

  /** Active tab in the left sidebar: file tree or document outline. */
  readonly sidebarTab = signal<'files' | 'outline'>('files');

  // ── Editor content ─────────────────────────────────────────────────────────

  readonly isLoadingDocument = signal(true);
  /** True while role/collab info loads in the background after the editor is visible. */
  readonly isLoadingMeta     = signal(false);
  /** True while Yjs is connecting (collab mode only). */
  readonly yjsSyncing        = signal(false);

  readonly content       = signal('');
  readonly compiling      = signal(false);
  readonly compileError   = signal<DiagnosticMessage[] | null>(null);
  readonly errorExpanded  = signal(false);

  toggleErrorPanel(): void { this.errorExpanded.update((v) => !v); }
  readonly vectorData    = signal<Uint8Array | null>(null);
  readonly documentTitle = signal('Sin título');
  readonly saveStatus    = signal<'guardado' | 'guardando' | 'sin-guardar'>('guardado');
  readonly projectFiles  = signal<ProjectFile[]>([]);
  readonly activeFile    = signal('main.typ');

  readonly imageFiles = signal<(ImageFile & { data: Uint8Array })[]>([]);

  // ── Document outline ───────────────────────────────────────────────────────

  /** Headings extracted from the Typst source for the outline panel. */
  readonly outlineHeadings = computed<OutlineHeading[]>(() => {
    const source   = this.content();
    const lines    = source.split('\n');
    const format   = detectHeadingNumbering(source);
    const counters: number[] = [];
    const results: OutlineHeading[] = [];

    lines.forEach((line, i) => {
      const match = line.match(/^\s*(=+)\s+(.+)$/);
      if (!match) return;

      const level = match[1].length;
      const text  = match[2].trim();

      let number: string | undefined;
      if (format) {
        while (counters.length < level) counters.push(0);
        counters[level - 1]++;
        for (let j = level; j < counters.length; j++) counters[j] = 0;
        number = formatHeadingNumber(counters.slice(0, level), format);
      }

      results.push({ level, text, line: i + 1, number });
    });

    return results;
  });

  onHeadingClick(heading: OutlineHeading): void {
    this.editorPanel()?.scrollToLine(heading.line);

    const totalLines = this.content().split('\n').length;
    const pages      = this.pageCount();
    if (pages > 0 && totalLines > 0) {
      const estimated = Math.max(1, Math.round((heading.line / totalLines) * pages));
      this.previewPanel()?.scrollToPage(estimated);
    }
  }

  // ── Document statistics ────────────────────────────────────────────────────

  readonly wordCount = computed(() => {
    const text = this.content().trim();
    return text ? text.split(/\s+/).length : 0;
  });

  readonly charCount = computed(() => this.content().length);

  readonly pageCount = computed(() => this.previewPanel()?.pageCount() ?? 0);

  // ── Collaboration state ────────────────────────────────────────────────────

  readonly userRole        = signal<'owner' | 'editor' | 'viewer'>('owner');
  readonly isCollaborative = signal(false);
  /** Always in sync with CollaborationService — no manual .set() needed. */
  readonly collaborators   = computed(() => this.collaborationService.collaborators());

  /** Yjs binding passed to EditorPanel in collaborative mode; null in solo mode. */
  readonly yjsBinding = signal<YjsBinding | null>(null);

  /** Users currently connected to the document (only populated in collab mode). */
  readonly presenceUsers = signal<PresenceUser[]>([]);

  private ydoc:        Y.Doc | null = null;
  private yjsProvider: SupabaseYjsProvider | null = null;
  private collaboratorWatchChannel: RealtimeChannel | null = null;

  /** Set to true in ngOnDestroy — guards async operations that create object URLs. */
  private pageDestroyed = false;

  /** Set to true when the user cancels an in-flight inline AI generation. */
  private inlineStreamCancelled = false;

  /** Reference to the EditorPanel child — used to call `setContent()` in solo mode. */
  private readonly editorPanel  = viewChild(EditorPanel);

  /** Reference to the ChatPanel child — used to inject quoted context from editor selections. */
  private readonly chatPanel    = viewChild(ChatPanel);

  /** Reference to the PreviewPanel child — used to capture thumbnail from the already-rendered canvas. */
  private readonly previewPanel = viewChild(PreviewPanel);

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveDocument();
    }
  }

  /**
   * Flushes the current content to localStorage before the page unloads.
   *
   * Protects solo-mode content that changed after the last auto-save debounce
   * fired (e.g. the user types, then immediately closes the tab within 2 s).
   * On the next visit, initDocument() picks up the draft and restores it.
   */
  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    // Only flush to localStorage when there are unsaved changes.
    // Skipping when 'guardado' avoids falsely marking the document as
    // modified on the next visit (initDocument finds the draft and sets
    // saveStatus to 'sin-guardar' even though content matches the DB).
    if (!this.isCollaborative() && this.saveStatus() !== 'guardado') {
      localStorage.setItem(this.draftKey, this.content());
    }
  }

  constructor() {
    // Re-compile automatically whenever the image registry changes so that
    // documents referencing images never show a stale/broken preview after
    // images finish loading from Storage or the user uploads a new file.
    effect(() => {
      const images = this.imageFiles();
      const src    = this.content();
      if (images.length > 0 && src && !this.isLoadingDocument()) {
        this.triggerCompile(src);
      }
    });
  }

  ngOnInit(): void {
    this.initDocument();
  }

  private async initDocument(): Promise<void> {
    const doc =
      this.documentService.getById(this.documentId) ??
      (await this.documentService.fetchById(this.documentId));

    if (!doc) {
      this.router.navigate(['/app']);
      return;
    }

    // ── Phase 1: show the editor immediately ──────────────────────────────
    // Images are loaded before the first compile so that documents referencing
    // images don't produce a "file not found" error on first open.
    // The preview skeleton stays visible during the image download.
    this.documentTitle.set(doc.title);
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);

    const draft   = localStorage.getItem(this.draftKey);
    const initial = draft ?? doc.content;
    this.content.set(initial);
    this.editorPanel()?.setContent(initial);

    // Download images from Storage first, then compile.
    // Errors are swallowed so a missing/empty bucket never blocks the editor.
    await this.loadProjectImages().catch(() => {});
    this.triggerCompile(initial);

    // Hide the full-page spinner — the editor is interactive from this point.
    this.isLoadingDocument.set(false);

    // ── Phase 2: load role / collab in background ─────────────────────────
    this.isLoadingMeta.set(true);

    const [role] = await Promise.all([
      this.collaborationService.loadRole(this.documentId),
      this.collaborationService.loadCollaborators(this.documentId),
    ]);

    this.isLoadingMeta.set(false);

    const uiRole    = role === 'admin' ? 'editor' : role;
    this.userRole.set(uiRole);

    const collabList = this.collaborationService.collaborators();
    const isCollab   = role !== 'owner' || collabList.length > 0;
    this.isCollaborative.set(isCollab);

    if (isCollab) {
      // Show a non-blocking syncing chip while Yjs connects.
      this.yjsSyncing.set(true);
      await this.initYjs(doc.content);
      this.yjsSyncing.set(false);
      // Discard any local draft — Yjs state is authoritative in collab mode.
      localStorage.removeItem(this.draftKey);
    } else {
      if (draft) this.saveStatus.set('sin-guardar');
    }

    this.scheduleThumbnailUpdate();
    this.watchCollaboratorChanges();
  }

  private async initYjs(fallbackContent: string): Promise<void> {
    const user    = this.auth.user()!;
    const profile = await this.collaborationService.getProfile(user.id);

    this.ydoc = new Y.Doc();
    const yText = this.ydoc.getText('content');

    this.yjsProvider = new SupabaseYjsProvider(
      this.ydoc,
      this.documentId,
      this.supabase,
      { id: user.id, displayName: profile?.full_name ?? user.email ?? 'Usuario' },
    );

    await this.yjsProvider.connect();

    // Keep presenceUsers signal in sync with awareness state.
    this.yjsProvider.onPresenceChange((users) => this.presenceUsers.set(users));
    this.presenceUsers.set(this.yjsProvider.getCurrentPresence());

    // Bootstrap from Supabase content when the Yjs doc is empty (first collab session).
    if (yText.length === 0 && fallbackContent) {
      this.ydoc.transact(() => yText.insert(0, fallbackContent));
    }

    this.yjsBinding.set({ yText, awareness: this.yjsProvider.awareness });

    // Observe Y.Text changes to keep `content` signal and compiler in sync.
    yText.observe(() => {
      const source = yText.toString();
      this.content.set(source);
      this.saveStatus.set('sin-guardar');
      this.scheduleAutoSave();

      if (this.compileTimer !== null) clearTimeout(this.compileTimer);
      this.compiling.set(true);
      this.compileTimer = setTimeout(() => {
        this.compileTimer = null;
        this.triggerCompile(source);
      }, COMPILE_DEBOUNCE_MS);
    });

    // Clear any stale solo draft.
    localStorage.removeItem(this.draftKey);

    this.triggerCompile(yText.toString());
  }

  private watchCollaboratorChanges(): void {
    this.collaboratorWatchChannel = this.collaborationService.subscribeToCollaboratorChanges(
      this.documentId,
      async () => {
        await this.collaborationService.loadCollaborators(this.documentId);
        const collabList = this.collaborationService.collaborators();

        // If we were removed from collaborators or the document was deleted:
        const doc = this.documentService.getById(this.documentId);
        if (!doc) {
          const fetched = await this.documentService.fetchById(this.documentId);
          if (!fetched) {
            this.router.navigate(['/app']);
            return;
          }
        }

        // If owner added the first collaborator, activate Yjs.
        const isCollab = this.userRole() !== 'owner' || collabList.length > 0;
        if (isCollab && !this.isCollaborative()) {
          this.isCollaborative.set(true);
          await this.initYjs(this.content());
        }
        // If owner removed last collaborator, deactivate Yjs.
        if (!isCollab && this.isCollaborative()) {
          this.deactivateYjs();
        }
      },
    );
  }

  private deactivateYjs(): void {
    this.yjsProvider?.destroy();
    this.yjsProvider = null;
    this.ydoc?.destroy();
    this.ydoc = null;
    this.yjsBinding.set(null);
    this.presenceUsers.set([]);
    this.isCollaborative.set(false);
    // Persist current content to solo column.
    void this.documentService.saveContent(this.documentId, this.content());
  }

  ngOnDestroy(): void {
    this.pageDestroyed = true;
    if (this.compileTimer   !== null) clearTimeout(this.compileTimer);
    if (this.autoSaveTimer  !== null) clearTimeout(this.autoSaveTimer);
    if (this.thumbnailTimer !== null) clearTimeout(this.thumbnailTimer);
    for (const img of this.imageFiles()) URL.revokeObjectURL(img.previewUrl);

    // In collaborative mode, sync the final Yjs text back to the `content` column
    // so the fallback in initYjs() is always fresh on re-entry — even if yjs_state
    // fails to load (migration not run, race condition, RLS issue, etc.).
    if (this.isCollaborative() && this.ydoc) {
      this.documentService.syncCollabContent(
        this.documentId,
        this.ydoc.getText('content').toString(),
      );
    }

    this.yjsProvider?.destroy();
    this.ydoc?.destroy();
    if (this.collaboratorWatchChannel) {
      void this.supabase.removeChannel(this.collaboratorWatchChannel);
    }
  }

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer !== null) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.saveDocument();
    }, this.AUTO_SAVE_DEBOUNCE_MS);
  }

  // ── Content changes (solo mode only) ───────────────────────────────────────

  onContentChange(source: string): void {
    if (this.isCollaborative()) return; // Yjs drives content in collab mode.
    this.content.set(source);
    this.saveStatus.set('sin-guardar');
    localStorage.setItem(this.draftKey, source);
    this.scheduleAutoSave();

    if (this.compileTimer !== null) clearTimeout(this.compileTimer);
    this.compiling.set(true);
    this.compileTimer = setTimeout(() => {
      this.compileTimer = null;
      this.triggerCompile(source);
    }, COMPILE_DEBOUNCE_MS);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  /**
   * Saves the current content to Supabase and waits for completion.
   *
   * Call this before any file-tree mutation (addFile, deleteFile, renameFile,
   * folder operations) to ensure doc.files in the cache is up-to-date before
   * the mutation reads it. Without this, the stale files array would be
   * written to Supabase, erasing unsaved content from the active file.
   *
   * No-op if there are no unsaved changes or we're in collaborative mode.
   */
  private async flushIfUnsaved(): Promise<void> {
    if (this.isCollaborative() || this.saveStatus() !== 'sin-guardar') return;
    const savedContent = this.content();
    this.saveStatus.set('guardando');
    const { error } = await this.documentService.saveContent(this.documentId, savedContent);
    if (error) {
      this.saveStatus.set('sin-guardar');
    } else {
      this.saveStatus.set('guardado');
      if (localStorage.getItem(this.draftKey) === savedContent) {
        localStorage.removeItem(this.draftKey);
      }
    }
  }

  saveDocument(): void {
    if (this.isCollaborative()) {
      const contentToSave = this.content();
      this.saveStatus.set('guardando');
      // Save both yjs_state (for real-time sync) and content column (reliable fallback).
      void Promise.all([
        this.yjsProvider?.persistState() ?? Promise.resolve(),
        this.documentService.saveContent(this.documentId, contentToSave),
      ]).then(() => {
        this.saveStatus.set('guardado');
        this.scheduleThumbnailUpdate();
      }).catch(() => {
        this.saveStatus.set('sin-guardar');
        this.toast.error('Error al guardar. Comprueba tu conexión.');
      });
      return;
    }
    const savedContent = this.content();
    this.saveStatus.set('guardando');
    this.documentService.saveContent(this.documentId, savedContent).then(({ error }) => {
      if (error) {
        this.saveStatus.set('sin-guardar');
        this.toast.error('Error al guardar. Comprueba tu conexión.');
      } else {
        this.saveStatus.set('guardado');
        // Only remove the draft if it hasn't changed since we started saving.
        // Prevents a race condition where the user edits or navigates away
        // while the async save is in-flight, which would delete newer content.
        if (localStorage.getItem(this.draftKey) === savedContent) {
          localStorage.removeItem(this.draftKey);
        }
        this.scheduleThumbnailUpdate();
      }
    });
  }

  // ── Compile ────────────────────────────────────────────────────────────────

  private async triggerCompile(source: string): Promise<void> {
    this.compiling.set(true);
    try {
      const sources = this.projectFiles()
        .filter((f) => !f.isFolder)
        .map((f) => (f.name === this.activeFile() ? { ...f, content: source } : f));
      const { vectorData, diagnostics } = await this.compiler.compile(source, sources);
      this.vectorData.set(vectorData);
      // Show warnings if any; clear errors from a previous failed compile.
      const warnings = diagnostics.filter((d) => d.severity !== 'error');
      this.compileError.set(warnings.length > 0 ? warnings : null);
      this.errorExpanded.set(false);
      this.compiling.set(false);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Cancelled')) return;
      // CompileError carries structured diagnostics from the compiler.
      const diagnostics = err instanceof CompileError ? err.diagnostics : [];
      this.compileError.set(
        diagnostics.length > 0
          ? diagnostics
          : [{ severity: 'error', message: err instanceof Error ? err.message : String(err), path: '', range: '', package: '' }],
      );
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

  download(format: DownloadFormat): void {
    const title = this.documentTitle();

    if (format === 'pdf') {
      this.compiler.exportPdf()
        .then((bytes) => {
          this.triggerDownload(`${title}.pdf`, new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
        })
        .catch(() => {});
      return;
    }

    // SVG / PNG → open the page-picker dialog; actual export runs in confirmExport().
    this.exportDialogFormat.set(format);
  }

  async confirmExport(selection: ExportSelection): Promise<void> {
    const format = this.exportDialogFormat();
    this.exportDialogFormat.set(null);
    if (!format) return;

    const title = this.documentTitle();
    const { page } = selection;

    // ── PNG ──────────────────────────────────────────────────────────────────
    if (format === 'png') {
      const panel = this.previewPanel();
      if (!panel) return;

      if (page === 'all') {
        const { zipSync } = await import('fflate');
        const count = this.pageCount();
        const files: Record<string, Uint8Array> = {};
        for (let i = 0; i < count; i++) {
          const blob = await panel.capturePageAt(i);
          if (blob) {
            files[`${title}-page-${i + 1}.png`] = new Uint8Array(await blob.arrayBuffer());
          }
        }
        const zipData = zipSync(files);
        this.triggerDownload(`${title}.zip`, new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' }));
      } else {
        const blob = await panel.capturePageAt(page - 1);
        if (blob) this.triggerDownload(`${title}-page-${page}.png`, blob);
      }
      return;
    }

    // ── SVG ──────────────────────────────────────────────────────────────────
    const vectorData = this.vectorData();
    if (!vectorData) return;

    // Fresh renderer instance — avoids conflicting with the global preview renderer.
    const renderer = createTypstRenderer();
    try {
      await renderer.init(RENDERER_OPTIONS);

      if (page === 'all') {
        const { zipSync, strToU8 } = await import('fflate');
        const files: Record<string, Uint8Array> = {};
        await renderer.runWithSession(
          { format: 'vector', artifactContent: vectorData },
          async (session) => {
            const pages = renderer.retrievePagesInfoFromSession(session);
            let cumY = 0;
            for (let i = 0; i < pages.length; i++) {
              const { width, height } = pages[i];
              const svgStr = await renderer.renderSvg({
                renderSession: session,
                window: { lo: { x: 0, y: cumY }, hi: { x: width, y: cumY + height } },
              });
              files[`${title}-page-${i + 1}.svg`] = strToU8(svgStr);
              cumY += height;
            }
          },
        );
        const zipData = zipSync(files);
        this.triggerDownload(`${title}.zip`, new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' }));
      } else {
        await renderer.runWithSession(
          { format: 'vector', artifactContent: vectorData },
          async (session) => {
            const pages = renderer.retrievePagesInfoFromSession(session);
            const idx   = page - 1;
            let cumY = 0;
            for (let i = 0; i < idx; i++) cumY += pages[i].height;
            const { width, height } = pages[idx];
            const svgStr = await renderer.renderSvg({
              renderSession: session,
              window: { lo: { x: 0, y: cumY }, hi: { x: width, y: cumY + height } },
            });
            this.triggerDownload(
              `${title}-page-${page}.svg`,
              new Blob([svgStr], { type: 'image/svg+xml' }),
            );
          },
        );
      }
    } catch { /* silently ignore export errors */ }
  }

  private triggerDownload(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Panel toggles ──────────────────────────────────────────────────────────

  /** Returns the start position from a range string like "5:1-5:10" → "5:1". */
  protected diagRangeStart(range: string): string {
    const sep = range.indexOf('-');
    return sep > -1 ? range.slice(0, sep) : range;
  }

  /** True when the diagnostic list contains at least one error (not just warnings). */
  protected diagHasErrors(diags: DiagnosticMessage[]): boolean {
    return diags.some((d) => d.severity === 'error');
  }

  /** Jumps the editor cursor to the location reported by a diagnostic. */
  protected jumpToDiagnostic(diag: DiagnosticMessage): void {
    if (!diag.range) return;
    const m = /^(\d+):(\d+)/.exec(diag.range);
    if (!m) return;
    this.editorPanel()?.jumpToPosition(+m[1], +m[2]);
  }

  toggleChat(): void    { this.chatOpen.update((v) => !v); }
  toggleFile(): void    { this.filesOpen.update((v) => !v); }
  toggleSharing(): void {
    const opening = !this.sharingOpen();
    this.sharingOpen.set(opening);
    // Refresh collaborator list every time the panel opens.
    if (opening) {
      void this.collaborationService.loadCollaborators(this.documentId);
    }
  }

  /** Inserts AI-generated content at the current cursor position in the editor. */
  insertAtCursor(text: string): void {
    this.editorPanel()?.insertAtCursor(text);
    this.toast.success('Contenido insertado en el editor');
  }

  /** Opens the chat panel and loads the selected text as a quoted context. */
  onAskAi(selectedText: string): void {
    this.chatOpen.set(true);
    this.chatPanel()?.setQuotedContext(selectedText);
  }

  /**
   * Handles the Ctrl+K inline AI command.
   *
   * Streams AI-generated Typst token-by-token directly into the editor via
   * EditorPanel.streamToken(). The streaming runs outside Angular's zone for
   * performance; each token re-enters the zone only for the DOM write.
   * On error the inserted content is discarded automatically.
   */
  async onAiInlineCommand(event: { prompt: string; cursorPos: number }): Promise<void> {
    const editor = this.editorPanel();
    if (!editor) return;

    this.inlineStreamCancelled = false;

    const MAX_CONTEXT_CHARS = 1_500;
    const context = this.content()
      .split('\n').slice(0, 40).join('\n')
      .slice(0, MAX_CONTEXT_CHARS);

    // Combine: full SYSTEM_PROMPT (Markdown→Typst rules) + inline addendum (raw output override).
    const systemPrompt = SYSTEM_PROMPT + INLINE_PROMPT_ADDENDUM.replace('{context}', context);

    try {
      // Buffer the full response before inserting.
      // The model sometimes wraps output in ```typst fences despite instructions —
      // buffering lets us strip them client-side before anything touches the document.
      let raw = '';
      await this.zone.runOutsideAngular(async () => {
        for await (const token of this.aiService.chat(
          [{ role: 'user', content: event.prompt }],
          undefined,
          this.documentId,
          systemPrompt,
        )) {
          if (this.inlineStreamCancelled) break;
          raw += token;
        }
      });

      if (this.inlineStreamCancelled) return;

      const cleaned = stripInlineCodeFences(raw);
      this.zone.run(() => editor.streamToken(cleaned));
      editor.finishStream();
    } catch {
      if (this.inlineStreamCancelled) return;
      editor.discardInlineInsert();
      this.toast.error('Error al generar contenido. Inténtalo de nuevo.');
    }
  }

  /** Handles the cancel button pressed during inline AI streaming. */
  onCancelInlineStream(): void {
    this.inlineStreamCancelled = true;
  }

  /**
   * Returns the best available document context for the AI assistant.
   *
   * Priority:
   *  1. Active CodeMirror selection (if the user has text highlighted).
   *  2. First 50 lines of the document (covers #set/#show rules and structure).
   *
   * Result is always truncated to 3 000 characters to keep token usage bounded.
   */
  readonly getEditorContext = (): string => {
    const MAX_CHARS   = 3_000;
    const HEADER_LINES = 50;

    const selection = this.editorPanel()?.getSelection() ?? '';
    const source    = selection || this.content().split('\n').slice(0, HEADER_LINES).join('\n');

    return source.length > MAX_CHARS ? source.slice(0, MAX_CHARS) + '\n// [... truncado]' : source;
  };

  // ── File management ────────────────────────────────────────────────────────

  async onFileSelect(fileName: string): Promise<void> {
    // Avoid an unnecessary Supabase write when there are no unsaved changes.
    if (this.saveStatus() === 'sin-guardar') {
      await this.documentService.saveContent(this.documentId, this.content());
    }
    await this.documentService.switchFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.activeFile.set(fileName);
    this.content.set(doc.content);
    this.projectFiles.set(doc.files);

    if (this.yjsBinding()) {
      // Collaborative mode: replace Y.Text content with the new file's content.
      const { yText } = this.yjsBinding()!;
      this.ydoc!.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, doc.content);
      });
    } else {
      this.editorPanel()?.setContent(doc.content);
    }
    this.triggerCompile(doc.content);
  }

  async onFileRename(event: { oldName: string; newName: string }): Promise<void> {
    await this.flushIfUnsaved();
    await this.documentService.renameFile(this.documentId, event.oldName, event.newName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
  }

  async onFileCreate(fileName: string): Promise<void> {
    if (!fileName) return;
    await this.flushIfUnsaved();
    await this.documentService.addFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (doc) this.projectFiles.set(doc.files);
  }

  async onFileDelete(fileName: string): Promise<void> {
    await this.flushIfUnsaved();
    await this.documentService.deleteFile(this.documentId, fileName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
    const newContent = doc.content;
    this.content.set(newContent);
    this.editorPanel()?.setContent(newContent);
  }

  // ── Image management ───────────────────────────────────────────────────────

  onImageUpload(file: { name: string; data: Uint8Array }): void {
    const previewUrl = URL.createObjectURL(new Blob([file.data.buffer as ArrayBuffer]));
    const existing   = this.imageFiles().find((i) => i.name === file.name);
    if (existing) URL.revokeObjectURL(existing.previewUrl);
    this.imageFiles.update((imgs) => [
      ...imgs.filter((i) => i.name !== file.name),
      { name: file.name, previewUrl, data: file.data },
    ]);
    this.compiler.addFile(`/${file.name}`, file.data);
    this.triggerCompile(this.content());
    void this.assetService.uploadImage(this.documentId, file.name, file.data);
  }

  onImageRename(event: { oldName: string; newName: string }): void {
    const { oldName, newName } = event;
    const img = this.imageFiles().find((i) => i.name === oldName);
    if (!img) return;
    this.compiler.removeFile(`/${oldName}`);
    this.compiler.addFile(`/${newName}`, img.data);
    this.imageFiles.update((imgs) =>
      imgs.map((i) => (i.name === oldName ? { ...i, name: newName } : i)),
    );
    this.triggerCompile(this.content());
    void this.assetService.renameImage(this.documentId, oldName, newName);
  }

  onImageDelete(name: string): void {
    const img = this.imageFiles().find((i) => i.name === name);
    if (!img) return;
    URL.revokeObjectURL(img.previewUrl);
    this.compiler.removeFile(`/${name}`);
    this.imageFiles.update((imgs) => imgs.filter((i) => i.name !== name));
    this.triggerCompile(this.content());
    void this.assetService.deleteImage(this.documentId, name);
  }

  // ── Image persistence ──────────────────────────────────────────────────────

  private async loadProjectImages(): Promise<void> {
    const images = await this.assetService.loadImages(this.documentId);
    if (!images.length || this.pageDestroyed) return;

    for (const img of images) {
      const previewUrl = URL.createObjectURL(new Blob([img.data.buffer as ArrayBuffer]));
      const existing   = this.imageFiles().find((i) => i.name === img.name);
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      this.imageFiles.update((imgs) => [
        ...imgs.filter((i) => i.name !== img.name),
        { name: img.name, previewUrl, data: img.data },
      ]);
      this.compiler.addFile(`/${img.name}`, img.data);
    }
    this.triggerCompile(this.content());
  }

  // ── Thumbnail ───────────────────────────────────────────────────────────────

  /**
   * Schedules a thumbnail update with a 10 s debounce so rapid successive
   * saves (auto-save) don't trigger multiple renders.
   *
   * Called after every successful save.
   */
  private scheduleThumbnailUpdate(): void {
    if (this.thumbnailTimer !== null) clearTimeout(this.thumbnailTimer);
    this.thumbnailTimer = setTimeout(() => {
      this.thumbnailTimer = null;
      void this.generateAndUploadThumbnail();
    }, 10_000);
  }

  /**
   * Captures the first page from the PreviewPanel's already-rendered canvas
   * and uploads it as a thumbnail PNG via AssetService.
   *
   * Reading a DOM canvas requires no WASM renderer call, so there is zero risk
   * of conflicting with the PreviewPanel's own render cycle.
   */
  private async generateAndUploadThumbnail(): Promise<void> {
    const blob = await this.previewPanel()?.captureFirstPage() ?? null;
    if (!blob) return;
    const url = await this.assetService.uploadThumbnail(this.documentId, blob);
    if (url) this.documentService.saveThumbnailUrl(this.documentId, url);
  }

  // ── Folder management ──────────────────────────────────────────────────────

  async onFolderCreate(folderName: string): Promise<void> {
    await this.flushIfUnsaved();
    await this.documentService.addProjectFolder(this.documentId, folderName);
    const doc = this.documentService.getById(this.documentId);
    if (doc) this.projectFiles.set(doc.files);
  }

  async onFolderRename(event: { oldName: string; newName: string }): Promise<void> {
    await this.flushIfUnsaved();
    await this.documentService.renameProjectFolder(this.documentId, event.oldName, event.newName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
  }

  async onFolderDelete(folderName: string): Promise<void> {
    await this.flushIfUnsaved();
    await this.documentService.deleteProjectFolder(this.documentId, folderName);
    const doc = this.documentService.getById(this.documentId);
    if (!doc) return;
    this.projectFiles.set(doc.files);
    this.activeFile.set(doc.activeFile);
    const newContent = doc.content;
    this.content.set(newContent);
    this.editorPanel()?.setContent(newContent);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts only the raw Typst content from an AI response.
 *
 * The model occasionally ignores instructions and returns prose before a code
 * block. This function handles all observed patterns:
 *  1. Response is entirely a ```typst fence  → strip fences, return content.
 *  2. Response has prose + ```typst block    → discard prose, return block content.
 *  3. Response has prose + ``` block         → same as above.
 *  4. Response is already raw Typst          → return as-is.
 */
function stripInlineCodeFences(text: string): string {
  // Try to extract the first ```typst (or generic ```) code block anywhere.
  const fenceMatch = text.match(/```(?:typst)?\r?\n([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text.trim();
}
