import type { Plugin } from 'vite';

/**
 * Vite plugin that fixes WASM loading in the Angular dev server.
 *
 * Two problems solved:
 *  1. MIME type — WebAssembly.compileStreaming() requires Content-Type: application/wasm.
 *     Vite sometimes serves .wasm as application/octet-stream, which the browser rejects.
 *  2. COOP/COEP headers — SharedArrayBuffer (used internally by the Typst WASM compiler)
 *     requires these headers to be present on every response.
 */
const wasmDevServer: Plugin = {
  name: 'wasm-dev-server',

  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      // Fix COOP/COEP for SharedArrayBuffer support.
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      // Fix MIME type for .wasm files.
      if (req.url?.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }

      next();
    });
  },
};

export default wasmDevServer;
