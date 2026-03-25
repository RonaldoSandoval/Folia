import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  LucideAngularModule,
  Regex,
  Replace,
  Search,
  X,
} from 'lucide-angular';
import type { EditorView } from '@codemirror/view';
import {
  SearchQuery,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from '@codemirror/search';

/**
 * Custom Angular search/replace panel that integrates with CodeMirror 6.
 *
 * The parent (EditorPanel) is responsible for:
 *  - Passing the live EditorView reference.
 *  - Showing/hiding this panel based on `searchOpen` signal.
 *  - Suppressing the native CodeMirror search panel.
 *
 * This component calls CodeMirror's search commands directly
 * (setSearchQuery, findNext, findPrevious, replaceNext, replaceAll).
 */
@Component({
  selector: 'app-search-panel',
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './search-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'absolute top-2 right-2 z-40 flex flex-col gap-1.5 rounded-lg border border-border border-l-2 border-l-brand/50 bg-surface shadow-lg p-2 w-[22rem]',
    '(keydown)': 'onKeydown($event)',
  },
})
export class SearchPanel implements OnDestroy {
  // ── Inputs / outputs ───────────────────────────────────────────────────────
  readonly view = input<EditorView | null>(null);
  readonly mode = input<'find' | 'replace'>('find');
  readonly close = output<void>();

  // ── Icons ─────────────────────────────────────────────────────────────────
  protected readonly Search        = Search;
  protected readonly ChevronUp     = ChevronUp;
  protected readonly ChevronDown   = ChevronDown;
  protected readonly X             = X;
  protected readonly CaseSensitive = CaseSensitive;
  protected readonly Regex         = Regex;
  protected readonly Replace       = Replace;

  // ── State ─────────────────────────────────────────────────────────────────
  protected searchTerm   = '';
  protected replaceTerm  = '';
  protected caseSensitive = signal(false);
  protected useRegex      = signal(false);
  protected matchCount    = signal<number | null>(null);

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // Focus the search input whenever the panel becomes visible (view changes).
    effect(() => {
      const v = this.view();
      if (!v) return;
      setTimeout(() => this.searchInputRef()?.nativeElement.focus());
    });
  }

  // ── Public helpers ─────────────────────────────────────────────────────────

  /** Called by EditorPanel to pre-fill the search box with selected text. */
  prefillSearch(text: string): void {
    this.searchTerm = text;
    this.syncQuery();
    setTimeout(() => {
      const input = this.searchInputRef()?.nativeElement;
      if (input) { input.value = text; input.select(); }
    });
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  protected onSearchInput(value: string): void {
    this.searchTerm = value;
    this.syncQuery();
  }

  protected onReplaceInput(value: string): void {
    this.replaceTerm = value;
    this.syncQuery();
  }

  protected toggleCase(): void {
    this.caseSensitive.update(v => !v);
    this.syncQuery();
  }

  protected toggleRegex(): void {
    this.useRegex.update(v => !v);
    this.syncQuery();
  }

  protected doFindNext(): void {
    const v = this.view();
    if (!v || !this.searchTerm) return;
    findNext(v);
    v.focus();
  }

  protected doFindPrev(): void {
    const v = this.view();
    if (!v || !this.searchTerm) return;
    findPrevious(v);
    v.focus();
  }

  protected doReplaceNext(): void {
    const v = this.view();
    if (!v || !this.searchTerm) return;
    replaceNext(v);
    // Re-count after the replacement mutated the document.
    setTimeout(() => this.updateCount(v));
    v.focus();
  }

  protected doReplaceAll(): void {
    const v = this.view();
    if (!v || !this.searchTerm) return;
    replaceAll(v);
    this.matchCount.set(0);
    v.focus();
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close.emit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.shiftKey ? this.doFindPrev() : this.doFindNext();
    }
  }

  ngOnDestroy(): void {
    const v = this.view();
    if (v) {
      v.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildQuery(): SearchQuery {
    return new SearchQuery({
      search:        this.searchTerm,
      replace:       this.replaceTerm,
      caseSensitive: this.caseSensitive(),
      regexp:        this.useRegex(),
    });
  }

  private syncQuery(): void {
    const v = this.view();
    if (!v) return;
    v.dispatch({ effects: setSearchQuery.of(this.buildQuery()) });
    this.updateCount(v);
  }

  private updateCount(v: EditorView): void {
    if (!this.searchTerm) { this.matchCount.set(null); return; }
    try {
      this.matchCount.set(countMatches(v.state.doc.toString(), this.searchTerm, this.caseSensitive(), this.useRegex()));
    } catch {
      // Invalid regex — show nothing
      this.matchCount.set(null);
    }
  }
}

/** Counts occurrences of `term` in `text` using JS string/regex search. */
function countMatches(text: string, term: string, caseSensitive: boolean, regexp: boolean): number {
  if (!term) return 0;
  if (regexp) {
    const flags = caseSensitive ? 'g' : 'gi';
    return (text.match(new RegExp(term, flags)) ?? []).length;
  }
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle   = caseSensitive ? term : term.toLowerCase();
  let count = 0;
  let pos   = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1 && count < 9999) {
    count++;
    pos += needle.length;
  }
  return count;
}
