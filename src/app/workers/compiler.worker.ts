/// <reference lib="webworker" />
import { $typst, loadFonts } from '@myriaddreamin/typst.ts';

/**
 * A single compiler diagnostic (error or warning).
 * Mirrors the internal DiagnosticMessage shape from @myriaddreamin/typst.ts,
 * which is not publicly exported so we redeclare it here.
 */
export interface DiagnosticMessage {
  package:  string;
  path:     string;
  severity: string; // 'error' | 'warning'
  range:    string; // "startLine:startCol-endLine:endCol"
  message:  string;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Cached promise that resolves once the Typst compiler options are set. */
let initPromise: Promise<void> | null = null;

/**
 * Returns a promise that resolves when the Typst WASM compiler has been
 * configured. The result is cached so the setup runs only once per worker
 * lifetime. If setup fails, the cache is left empty so the next compile
 * call can retry.
 */
function getInitPromise(): Promise<void> {
  if (initPromise) return initPromise;

  // setCompilerInitOptions is synchronous — wrap errors so callers always
  // receive a Promise, keeping the message-handler logic uniform.
  try {
    $typst.setCompilerInitOptions({
      getModule: () => getWasmModule(),
      // Load bundled text fonts from our local /assets/fonts/ directory
      // instead of the jsDelivr CDN.  Run `npm run fonts:download` once to
      // populate that directory.
      beforeBuild: [
        loadFonts([], {
          assets: ['text'],
          assetUrlPrefix: '/assets/fonts/',
        }),
      ],
      // $typst automatically adds FetchPackageRegistry (via doPrepareUse) when
      // no package-registry or access-model provider is set via use(). This means
      // #import "@preview/..." works without any extra setup here.
    });
  } catch (err) {
    // Do not cache the failure — allow the next compile call to retry.
    return Promise.reject(err);
  }

  initPromise = Promise.resolve();
  return initPromise;
}

// ---------------------------------------------------------------------------
// WASM module loader
// ---------------------------------------------------------------------------

/**
 * Fetches and compiles the Typst WASM compiler module.
 *
 * Caching is handled by the Service Worker (public/sw.js), which intercepts
 * this fetch and serves the file from its persistent Cache Storage with the
 * correct Content-Type: application/wasm header. This removes the need for
 * a duplicate Cache API inside the worker.
 *
 * The ArrayBuffer fallback handles two edge cases:
 *  1. First page load before the SW has installed and activated.
 *  2. Non-HTTPS contexts (localhost without SW support) where the server may
 *     send application/octet-stream, causing compileStreaming() to reject.
 */
async function getWasmModule(): Promise<WebAssembly.Module> {
  const url = '/assets/typst_ts_web_compiler_bg.wasm';
  try {
    // Fast path: SW serves the file from cache with the correct MIME type.
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    // Fallback: compile from an ArrayBuffer (always works regardless of MIME type).
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    return WebAssembly.compile(buf);
  }
}

// ---------------------------------------------------------------------------
// Result cache
// ---------------------------------------------------------------------------

/**
 * Fingerprint of the last successful compilation input.
 * Covers both `content` (main file) and all `sources` so that edits to any
 * project file correctly invalidate the cache even when main.typ is unchanged.
 */
let lastFingerprint = '';

/** The vector output of the last successful compilation (null if none yet). */
let lastVectorData: Uint8Array | null = null;

/** Builds a cheap string fingerprint covering all compilation inputs. */
function buildFingerprint(content: string, sources: SourceFile[]): string {
  return content + '\0' + sources.map((s) => `${s.name}\0${s.content}`).join('\0');
}

// ---------------------------------------------------------------------------
// Message types  (must stay in sync with CompilerService)
// ---------------------------------------------------------------------------

export type SourceFile        = { name: string; content: string };
export type CompileRequest    = { type: 'compile';     id: string; content: string; sources: SourceFile[] };
export type ExportPdfRequest  = { type: 'export-pdf';  id: string };
export type AddFileRequest    = { type: 'add-file';    path: string; data: Uint8Array };
export type RemoveFileRequest = { type: 'remove-file'; path: string };
export type WorkerRequest     = CompileRequest | ExportPdfRequest | AddFileRequest | RemoveFileRequest;

export type CompileResponse =
  | { id: string; type: 'success';     vectorData: Uint8Array; diagnostics: DiagnosticMessage[] }
  | { id: string; type: 'error';       message: string;        diagnostics: DiagnosticMessage[] }
  | { id: string; type: 'pdf-success'; data: Uint8Array }
  | { id: string; type: 'pdf-error';   message: string };

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

// Pre-warm: start loading WASM + fonts immediately when the worker spawns,
// so the first compile message finds the compiler already ready.
getInitPromise().catch(() => { /* surfaces as an error on the first compile */ });

addEventListener('message', async ({ data }: MessageEvent<WorkerRequest>) => {
  // ── add-file: register a binary asset (image, etc.) ──────────────────────
  if (data.type === 'add-file') {
    await getInitPromise();
    await $typst.mapShadow(data.path, data.data);
    lastFingerprint = '';
    return;
  }

  // ── export-pdf: re-compile to PDF and return bytes ───────────────────────
  if (data.type === 'export-pdf') {
    try {
      await getInitPromise();
      if (!lastVectorData) {
        throw new Error('No compiled document available for PDF export');
      }
      const pdfBytes = await $typst.pdf({ mainFilePath: '/main.typ', root: '/' });
      if (!pdfBytes) throw new Error('PDF export returned no data');
      const toSend = new Uint8Array(pdfBytes);
      postMessage(
        { id: data.id, type: 'pdf-success', data: toSend } satisfies CompileResponse,
        [toSend.buffer],
      );
    } catch (err) {
      postMessage({
        id: data.id,
        type: 'pdf-error',
        message: err instanceof Error ? err.message : String(err),
      } satisfies CompileResponse);
    }
    return;
  }

  // ── remove-file: unregister an asset from the virtual filesystem ──────────
  if (data.type === 'remove-file') {
    await getInitPromise();
    await $typst.unmapShadow(data.path);
    lastFingerprint = '';
    return;
  }

  // ── compile ───────────────────────────────────────────────────────────────
  const { id, content, sources } = data;

  try {
    await getInitPromise();

    // Return the cached result when nothing has changed (content + all sources).
    const fingerprint = buildFingerprint(content, sources);
    if (fingerprint === lastFingerprint && lastVectorData) {
      postMessage(
        { id, type: 'success', vectorData: lastVectorData, diagnostics: [] } satisfies CompileResponse,
      );
      return;
    }

    lastFingerprint = fingerprint;
    lastVectorData = null;

    // Register every project file so #include / #import work across files.
    // Sources other than main.typ are registered at their own paths (e.g. /bib.typ).
    // main.typ is always overridden with `content` (the current editor state,
    // which may differ from the saved version).
    for (const src of sources) {
      await $typst.addSource(`/${src.name}`, src.content);
    }
    await $typst.addSource('/main.typ', content);

    // $typst (TypstSnippet) wraps the compiler but strips the diagnostics API.
    // Use the underlying TypstCompiler directly to get structured diagnostics.
    const compiler = await $typst.getCompiler();
    const compileResult = await compiler.compile({
      mainFilePath: '/main.typ',
      root:         '/',
      format:       0, // CompileFormatEnum.vector — not exported from public API
      diagnostics:  'full',
    });

    const diagnostics: DiagnosticMessage[] = compileResult.diagnostics ?? [];

    if (!compileResult.result) {
      // Compilation failed — send structured diagnostics instead of a bare message.
      postMessage({
        id,
        type: 'error',
        message: 'Compilation failed',
        diagnostics,
      } satisfies CompileResponse);
      return;
    }

    lastVectorData = compileResult.result;

    // Clone so we can transfer the buffer (transfer detaches it — lastVectorData stays intact).
    const toSend = new Uint8Array(compileResult.result);
    postMessage(
      { id, type: 'success', vectorData: toSend, diagnostics } satisfies CompileResponse,
      [toSend.buffer],
    );
  } catch (err) {
    postMessage({
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      diagnostics: [],
    } satisfies CompileResponse);
  }
});
