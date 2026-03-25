import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { keymap, placeholder } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab } from 'y-codemirror.next';
import { LucideAngularModule, Sparkles, X } from 'lucide-angular';
import { typst } from '../../typst-language';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { ThemeService } from '../../../../core/service/theme/theme-service';


export interface YjsBinding {
  yText:     Y.Text;
  awareness: Awareness;
}

interface InlineCmd {
  state: 'input' | 'streaming' | 'done';
  top:   number;
  left:  number;
  width: number;
}

/**
 * Thin Angular wrapper around a CodeMirror 6 editor instance.
 *
 * Supports two modes:
 *  - Solo: plain contentChange emission on every keystroke.
 *  - Collaborative: yjsBinding drives content via y-codemirror.next;
 *    contentChange is suppressed (EditorPage observes Y.Text directly).
 *
 * Ctrl+K activates the inline AI command overlay, which streams AI-generated
 * Typst directly into the document. EditorPage drives the AI call and pushes
 * tokens via streamToken(); the overlay handles accept/discard locally.
 */
@Component({
  selector: 'app-editor-panel',
  imports: [LucideAngularModule],
  templateUrl: './editor-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full relative' },
})
export class EditorPanel implements OnDestroy {
  private readonly themeService = inject(ThemeService);
  private readonly zone         = inject(NgZone);
  private readonly cdr          = inject(ChangeDetectorRef);

  /** Initial Typst source loaded into the editor on first mount (solo mode). */
  initialContent = input<string>('');

  /**
   * When provided, binds CodeMirror to a Yjs Y.Text for collaborative editing.
   * In this mode `setContent()` is a no-op and `contentChange` is not emitted.
   */
  yjsBinding = input<YjsBinding | null>(null);

  /** When true the editor is read-only (viewer role in collaborative mode). */
  readonly = input<boolean>(false);

  /** Fired on every keystroke with the full document text (solo mode only). */
  contentChange = output<string>();

  /** Emitted when the user clicks "Ask AI" on a selection. */
  askAi = output<string>();

  /**
   * Emitted when the user submits an inline AI prompt (Ctrl+K → Enter).
   * EditorPage handles the AI call and feeds tokens back via streamToken().
   */
  aiInlineCommand = output<{ prompt: string; cursorPos: number }>();

  /** Emitted when the user cancels the streaming generation mid-flight. */
  cancelInlineStream = output<void>();

  protected readonly Sparkles = Sparkles;
  protected readonly X        = X;

  /** Position and text of the active selection popup. null = no selection. */
  readonly selectionPopup = signal<{ top: number; left: number; text: string } | null>(null);

  /** State of the inline AI command overlay. null = hidden. */
  protected readonly inlineCmd  = signal<InlineCmd | null>(null);
  protected readonly inlineDraft = signal('');

  private readonly host           = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly inlineInputRef = viewChild<ElementRef<HTMLInputElement>>('inlineInput');
  private readonly inlineDoneRef  = viewChild<ElementRef<HTMLDivElement>>('inlineDone');

  private view: EditorView | null = null;

  /** Content to use when `setContent()` is called before the view is ready. */
  private pendingContent: string | null = null;

  /** Cursor position where the current inline insert started. -1 = no active insert. */
  private inlineInsertStart = -1;
  /** Total characters inserted so far in the current inline session. */
  private inlineInsertLen   = 0;

  private readonly themeCompartment    = new Compartment();
  private readonly readonlyCompartment = new Compartment();

  private readonly structuralTheme = EditorView.theme({
    '&':           { height: '100%', fontSize: '13px' },
    '.cm-content':  { fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
    '.cm-scroller': { overflow: 'auto' },

  });


  private readonly lightTheme = EditorView.theme({
    '&':                     { backgroundColor: '#ffffff', color: '#000000' },
    '.cm-content':            { caretColor: '#000000' },
    '.cm-gutters':            { backgroundColor: '#f5f5f5', color: '#666', border: 'none' },
    '.cm-activeLine':         { backgroundColor: '#f0f0f0' },
    '.cm-activeLineGutter':   { backgroundColor: '#eaeaea' },
    '.cm-selectionBackground': { backgroundColor: '#cce5ff' },
  });

  constructor() {
    afterNextRender(() => {
      const isDark = this.themeService.isDark();
      const binding = this.yjsBinding();

      this.view = new EditorView({
        state: EditorState.create({
          doc:        binding ? binding.yText.toString() : (this.pendingContent ?? this.initialContent()),
          extensions: this.buildExtensions(isDark, binding),
        }),
        parent: this.host().nativeElement,
      });
      this.pendingContent = null;
    });

    // Hot-swap theme without recreating the view.
    effect(() => {
      const dark = this.themeService.isDark();
      if (!this.view) return;
      this.view.dispatch({
        effects: this.themeCompartment.reconfigure(dark ? oneDark : this.lightTheme),
      });
    });

    // Toggle read-only without recreating the view.
    effect(() => {
      const ro = this.readonly();
      if (!this.view) return;
      this.view.dispatch({
        effects: this.readonlyCompartment.reconfigure(EditorView.editable.of(!ro)),
      });
    });

    // React to yjsBinding arriving after the view was already created.
    effect(() => {
      const binding = this.yjsBinding();
      if (!this.view) return;
      this.view.setState(
        EditorState.create({
          doc:        binding ? binding.yText.toString() : this.view.state.doc.toString(),
          extensions: this.buildExtensions(this.themeService.isDark(), binding),
        }),
      );
    });
  }

  // ── Inline AI command (Ctrl+K) ─────────────────────────────────────────────

  /** Opens the inline command overlay at the cursor position. */
  private activateInlineCommand(view: EditorView): void {
    // Do nothing in read-only mode.
    if (this.readonly()) return;

    const pos    = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (!coords) return;

    const hostRect = this.host().nativeElement.getBoundingClientRect();
    const padding  = 16;
    const top      = coords.bottom - hostRect.top + 6;
    const left     = padding;
    const width    = Math.max(300, hostRect.width - padding * 2);

    this.inlineInsertStart = pos;
    this.inlineInsertLen   = 0;
    this.inlineDraft.set('');
    this.inlineCmd.set({ state: 'input', top, left, width });
    this.cdr.markForCheck();

    setTimeout(() => {
      this.inlineInputRef()?.nativeElement.focus();
    });
  }

  /** Called when user presses Enter in the inline input. */
  private submitInlineCommand(): void {
    const prompt = this.inlineDraft().trim();
    if (!prompt || !this.view) return;

    const cmd = this.inlineCmd();
    if (cmd) {
      this.inlineCmd.set({ ...cmd, state: 'streaming' });
      this.cdr.markForCheck();
    }

    this.aiInlineCommand.emit({ prompt, cursorPos: this.inlineInsertStart });
  }

  onInlineInputKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submitInlineCommand();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelInlineCommand();
    }
  }

  onInlineDoneKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      this.acceptInlineInsert();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.discardInlineInsert();
    }
  }

  /**
   * Appends a token from the AI stream directly into the document.
   * Called by EditorPage for each streamed token.
   * Works in both solo and collaborative (Yjs) mode.
   */
  streamToken(token: string): void {
    if (!this.view) return;
    const pos     = this.inlineInsertStart + this.inlineInsertLen;
    const binding = this.yjsBinding();

    if (binding) {
      // Collaborative: insert into Y.Text so all peers see it.
      binding.yText.insert(pos, token);
    } else {
      // Solo: dispatch directly to CodeMirror.
      this.view.dispatch({ changes: { from: pos, insert: token } });
    }
    this.inlineInsertLen += token.length;
  }

  /**
   * Called by EditorPage when the AI stream is complete.
   * Transitions the overlay to 'done' and focuses the accept/discard bar.
   */
  finishStream(): void {
    // In solo mode, emit once so EditorPage can update its content signal and
    // trigger a compile / auto-save debounce.
    if (!this.yjsBinding() && this.view) {
      this.contentChange.emit(this.view.state.doc.toString());
    }

    this.zone.run(() => {
      const cmd = this.inlineCmd();
      if (cmd) this.inlineCmd.set({ ...cmd, state: 'done' });
      this.cdr.markForCheck();
      queueMicrotask(() => this.inlineDoneRef()?.nativeElement.focus());
    });
  }

  /** Keeps the inserted content and closes the overlay. */
  acceptInlineInsert(): void {
    if (this.view) {
      // Place cursor after the inserted block.
      const anchor = this.inlineInsertStart + this.inlineInsertLen;
      this.view.dispatch({ selection: { anchor } });
    }
    this.inlineCmd.set(null);
    this.inlineInsertStart = -1;
    this.inlineInsertLen   = 0;
    this.view?.focus();
    this.cdr.markForCheck();
  }

  /** Removes the inserted content and closes the overlay. */
  discardInlineInsert(): void {
    if (this.view && this.inlineInsertLen > 0) {
      const from = this.inlineInsertStart;
      const to   = from + this.inlineInsertLen;
      this.view.dispatch({
        changes:   { from, to, insert: '' },
        selection: { anchor: from },
      });
      if (!this.yjsBinding()) {
        this.contentChange.emit(this.view.state.doc.toString());
      }
    }
    this.inlineCmd.set(null);
    this.inlineInsertStart = -1;
    this.inlineInsertLen   = 0;
    this.view?.focus();
    this.cdr.markForCheck();
  }

  /** Closes the overlay without inserting anything (pressed Esc on input state). */
  cancelInlineCommand(): void {
    this.inlineCmd.set(null);
    this.inlineDraft.set('');
    this.inlineInsertStart = -1;
    this.view?.focus();
    this.cdr.markForCheck();
  }

  /**
   * Called when the user clicks the cancel button during streaming.
   * Notifies EditorPage to abort the in-flight AI request, then resets state.
   */
  cancelStreaming(): void {
    this.cancelInlineStream.emit();
    this.inlineCmd.set(null);
    this.inlineDraft.set('');
    this.inlineInsertStart = -1;
    this.inlineInsertLen   = 0;
    this.view?.focus();
    this.cdr.markForCheck();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Inserts text at the current cursor position.
   * Used by the chat panel's "Insert" button.
   */
  insertAtCursor(text: string): void {
    if (!this.view) return;

    const pos     = this.view.state.selection.main.head;
    const binding = this.yjsBinding();

    if (binding) {
      const ydoc = binding.yText.doc;
      const doInsert = () => binding.yText.insert(pos, text);
      ydoc ? ydoc.transact(doInsert) : doInsert();
    } else {
      this.view.dispatch({
        changes:   { from: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      this.contentChange.emit(this.view.state.doc.toString());
    }
  }

  /** Returns the currently selected text, or '' if nothing is selected. */
  getSelection(): string {
    if (!this.view) return '';
    const { from, to } = this.view.state.selection.main;
    if (from === to) return '';
    return this.view.state.sliceDoc(from, to);
  }

  /** Replaces the editor content (solo mode only). No-op in collaborative mode. */
  setContent(text: string): void {
    if (this.yjsBinding()) return;

    if (!this.view) {
      this.pendingContent = text;
      return;
    }
    this.view.setState(
      EditorState.create({
        doc:        text,
        extensions: this.buildExtensions(this.themeService.isDark(), null),
      }),
    );
  }

  onAskAiClick(): void {
    const popup = this.selectionPopup();
    if (!popup) return;
    this.askAi.emit(popup.text);
    this.selectionPopup.set(null);
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  // ── Extensions builder ─────────────────────────────────────────────────────

  private buildExtensions(isDark: boolean, binding: YjsBinding | null) {
    const selectionListener = EditorView.updateListener.of((update) => {
      if (!update.selectionSet) return;
      const { from, to } = update.state.selection.main;
      if (from === to) { this.selectionPopup.set(null); return; }

      const text   = update.state.sliceDoc(from, to);
      const coords = update.view.coordsAtPos(to);
      if (!coords) { this.selectionPopup.set(null); return; }

      const hostRect = this.host().nativeElement.getBoundingClientRect();
      this.selectionPopup.set({
        top:  coords.bottom - hostRect.top  + 6,
        left: Math.max(0, coords.left - hostRect.left),
        text,
      });
    });

    // Ctrl+K (Cmd+K on Mac) opens the inline AI command overlay.
    const inlineCommandKeymap = keymap.of([{
      key: 'Mod-k',
      run: (v: EditorView) => {
        this.zone.run(() => this.activateInlineCommand(v));
        return true;
      },
    }]);

    const base = [
      basicSetup,
      typst(),
      this.themeCompartment.of(isDark ? oneDark : this.lightTheme),
      this.structuralTheme,
      this.readonlyCompartment.of(EditorView.editable.of(!this.readonly())),
      selectionListener,
      inlineCommandKeymap,
      placeholder('Empieza a escribir o presiona Ctrl+K para generar con IA…'),
    ];

    if (binding) {
      return [...base, yCollab(binding.yText, binding.awareness)];
    }

    return [
      ...base,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.contentChange.emit(update.state.doc.toString());
        }
      }),
    ];
  }
}
