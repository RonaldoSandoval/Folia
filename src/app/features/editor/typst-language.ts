import { LanguageSupport, StreamLanguage } from '@codemirror/language';

/**
 * Per-line parser state for the Typst StreamLanguage.
 * Tracks multi-line constructs that cross token boundaries.
 */
interface State {
  blockComment: boolean;
  math:         boolean; // inside $...$
  string:       boolean; // inside "..."
  rawBlock:     boolean; // inside ```...```
  raw:          boolean; // inside `...`
}


const typstStreamLanguage = StreamLanguage.define<State>({
  name: 'typst',

  startState: (): State => ({
    blockComment: false,
    math:         false,
    string:       false,
    rawBlock:     false,
    raw:          false,
  }),

  copyState: (s: State): State => ({ ...s }),

  token(stream, state): string | null {
    // ── Continuation states (multi-line constructs) ─────────────────────────

    if (state.blockComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    if (state.rawBlock) {
      if (stream.match('```')) state.rawBlock = false;
      else stream.skipToEnd();
      return 'string';
    }

    if (state.raw) {
      if (stream.skipTo('`')) {
        stream.match('`');
        state.raw = false;
      } else {
        stream.skipToEnd();
      }
      return 'string';
    }

    if (state.string) {
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped)        { escaped = false; continue; }
        if (ch === '\\')    { escaped = true;  continue; }
        if (ch === '"')     { state.string = false; break; }
      }
      return 'string';
    }

    if (state.math) {
      if (stream.match('$')) { state.math = false; return 'atom'; }
      if (stream.match('\\$')) return 'number'; // escaped dollar
      stream.next();
      return 'number';
    }

    // ── Single-line whitespace (no token) ───────────────────────────────────

    if (stream.eatSpace()) return null;

    // ── Line comment ────────────────────────────────────────────────────────

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    // ── Block comment ───────────────────────────────────────────────────────

    if (stream.match('/*')) {
      state.blockComment = true;
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.blockComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    // ── Heading (= at start of line) — consume the entire line ─────────────

    if (stream.sol() && stream.match(/^={1,6}(?=[ \t])/)) {
      stream.skipToEnd();
      return 'header';
    }

    // ── Triple-backtick raw block ───────────────────────────────────────────

    if (stream.match('```')) {
      stream.match(/^[a-zA-Z]*/); // optional language tag (e.g. ```rust)
      state.rawBlock = true;
      if (stream.match('```')) state.rawBlock = false;
      else stream.skipToEnd();
      return 'string';
    }

    // ── Single-backtick raw ─────────────────────────────────────────────────

    if (stream.match('`')) {
      state.raw = true;
      if (stream.skipTo('`')) {
        stream.match('`');
        state.raw = false;
      }
      return 'string';
    }

    // ── String literal ──────────────────────────────────────────────────────

    if (stream.match('"')) {
      state.string = true;
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped)     { escaped = false; continue; }
        if (ch === '\\') { escaped = true;  continue; }
        if (ch === '"')  { state.string = false; break; }
      }
      return 'string';
    }

    // ── Math mode $...$ ─────────────────────────────────────────────────────

    if (stream.match('$')) {
      state.math = true;
      return 'atom';
    }

    // ── Hash keyword / function  (#set, #let, #if, …) ──────────────────────

    if (stream.peek() === '#') {
      stream.next(); // consume #
      if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/)) return 'keyword';
      return 'meta'; // bare # (e.g. in content expressions)
    }

    // ── Label  <name> ───────────────────────────────────────────────────────

    if (stream.match(/^<[a-zA-Z_][a-zA-Z0-9_:.-]*>/)) return 'link';

    // ── Reference  @citation ────────────────────────────────────────────────

    if (stream.match(/^@[a-zA-Z_][a-zA-Z0-9_:.-]*/)) return 'link';

    // ── Number with optional Typst unit ────────────────────────────────────

    if (stream.match(/^-?[0-9]+(\.[0-9]+)?(pt|em|rem|mm|cm|in|%|fr|deg|rad)?/)) {
      return 'number';
    }

    // ── Default: advance one character ─────────────────────────────────────

    stream.next();
    return null;
  },

  blankLine(state): void {
    // Math mode cannot span blank lines in Typst.
    state.math = false;
  },
});

/** Returns the Typst language extension for CodeMirror 6. */
export function typst(): LanguageSupport {
  return new LanguageSupport(typstStreamLanguage);
}
