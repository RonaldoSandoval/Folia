import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, basicSetup } from 'codemirror';
import { ThemeService } from '../../../../core/service/theme/theme-service';

/**
 * Thin Angular wrapper around a CodeMirror 6 editor instance.
 *
 * - Reacts to the application theme (light / dark) via a CodeMirror Compartment,
 *   hot-swapping the color scheme without recreating the editor view.
 * - Exposes `setContent()` to replace the document content imperatively (e.g.
 *   on file switch) without destroying and remounting the component.
 * - Emits `contentChange` on every document change.
 */
@Component({
  selector: 'app-editor-panel',
  template: `<div #host class="h-full w-full overflow-hidden"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
})
export class EditorPanel implements OnDestroy {
  private readonly themeService = inject(ThemeService);

  /** Initial Typst source loaded into the editor on first mount. */
  initialContent = input<string>('');

  /** Fired on every keystroke with the full current document text. */
  contentChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private view: EditorView | null = null;

  /** Content to use when `setContent()` is called before the view is ready. */
  private pendingContent: string | null = null;

  /** CodeMirror Compartment that owns the active color-scheme extension. */
  private readonly themeCompartment = new Compartment();

  /** Structural (non-color) styles applied regardless of the active theme. */
  private readonly structuralTheme = EditorView.theme({
    '&': { height: '100%', fontSize: '13px' },
    '.cm-content': { fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
    '.cm-scroller': { overflow: 'auto' },
  });

  /** Color styles used in light mode. */
  private readonly lightTheme = EditorView.theme({
    '&': { backgroundColor: '#ffffff', color: '#000000' },
    '.cm-content': { caretColor: '#000000' },
    '.cm-gutters': { backgroundColor: '#f5f5f5', color: '#666', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#f0f0f0' },
    '.cm-activeLineGutter': { backgroundColor: '#eaeaea' },
    '.cm-selectionBackground': { backgroundColor: '#cce5ff' },
  });

  constructor() {
    // Initialize CodeMirror after the host element is in the DOM.
    afterNextRender(() => {
      const isDark = this.themeService.isDark();
      this.view = new EditorView({
        state: EditorState.create({
          doc: this.pendingContent ?? this.initialContent(),
          extensions: this.buildExtensions(isDark),
        }),
        parent: this.host().nativeElement,
      });
      this.pendingContent = null;
    });

    // Hot-swap the color scheme whenever the app theme changes — no view recreate.
    effect(() => {
      const dark = this.themeService.isDark();
      if (!this.view) return;
      this.view.dispatch({
        effects: this.themeCompartment.reconfigure(dark ? oneDark : this.lightTheme),
      });
    });
  }

  /**
   * Replaces the editor document with `text`.
   *
   * Creates a fresh EditorState (clearing undo history and resetting the cursor)
   * so the editor behaves as if it was opened with a new file.
   *
   * If called before the CodeMirror view has been initialized (i.e. before the
   * first render cycle), the content is stored and applied once the view is ready.
   */
  setContent(text: string): void {
    if (!this.view) {
      this.pendingContent = text;
      return;
    }
    this.view.setState(
      EditorState.create({
        doc: text,
        extensions: this.buildExtensions(this.themeService.isDark()),
      }),
    );
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  private buildExtensions(isDark: boolean) {
    return [
      basicSetup,
      this.themeCompartment.of(isDark ? oneDark : this.lightTheme),
      this.structuralTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.contentChange.emit(update.state.doc.toString());
        }
      }),
    ];
  }
}
