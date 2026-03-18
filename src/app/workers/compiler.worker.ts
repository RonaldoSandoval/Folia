/// <reference lib="webworker" />
import { $typst, loadFonts } from '@myriaddreamin/typst.ts';

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
      getModule: () => '/assets/typst_ts_web_compiler_bg.wasm',
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
// Result cache
// ---------------------------------------------------------------------------

/** The Typst source that produced the last successful compilation. */
let lastContent = '';

/** The vector output of the last successful compilation (null if none yet). */
let lastVectorData: Uint8Array | null = null;

// ---------------------------------------------------------------------------
// Message types  (must stay in sync with CompilerService)
// ---------------------------------------------------------------------------

export type CompileRequest  = { type: 'compile';     id: string; content: string };
export type AddFileRequest  = { type: 'add-file';    path: string; data: Uint8Array };
export type RemoveFileRequest = { type: 'remove-file'; path: string };
export type WorkerRequest   = CompileRequest | AddFileRequest | RemoveFileRequest;

export type CompileResponse =
  | { id: string; type: 'success'; vectorData: Uint8Array }
  | { id: string; type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

addEventListener('message', async ({ data }: MessageEvent<WorkerRequest>) => {
  // ── add-file: register a binary asset (image, etc.) ──────────────────────
  if (data.type === 'add-file') {
    await getInitPromise();
    await $typst.mapShadow(data.path, data.data);
    lastContent = '';
    return;
  }

  // ── remove-file: unregister an asset from the virtual filesystem ──────────
  if (data.type === 'remove-file') {
    await getInitPromise();
    await $typst.unmapShadow(data.path);
    lastContent = '';
    return;
  }

  // ── compile ───────────────────────────────────────────────────────────────
  const { id, content } = data;

  try {
    await getInitPromise();

    // Return the cached result when the source has not changed.
    if (content === lastContent && lastVectorData) {
      postMessage(
        { id, type: 'success', vectorData: lastVectorData } satisfies CompileResponse,
      );
      return;
    }

    lastContent = content;
    lastVectorData = null;

    // Register the source at a fixed path so the project root stays at '/'.
    // Using { mainContent } would place the source at '/tmp/{random}.typ',
    // making project root '/tmp/' and blocking access to images at '/photo.jpg'.
    // With addSource('/main.typ') + mainFilePath + root:'/', images are accessible.
    await $typst.addSource('/main.typ', content);
    const vectorData = await $typst.vector({ mainFilePath: '/main.typ', root: '/' });

    if (!vectorData) {
      throw new Error('Compiler returned no data');
    }

    lastVectorData = vectorData;

    postMessage({ id, type: 'success', vectorData } satisfies CompileResponse);
  } catch (err) {
    postMessage({
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies CompileResponse);
  }
});
