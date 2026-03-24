/**
 * Typs Service Worker — persistent WASM asset cache
 *
 * Goals:
 *  1. Pre-cache .wasm files on install so the compiler is ready before the
 *     user even opens a document (zero network cost on repeat visits).
 *  2. Guarantee Content-Type: application/wasm on every response so
 *     WebAssembly.compileStreaming() never rejects the file — even when the
 *     host serves it as application/octet-stream.
 *
 * Cache versioning: bump CACHE_NAME whenever the .wasm binaries change
 * (e.g. after a @myriaddreamin/typst-ts package upgrade). The activate
 * handler deletes any cache whose name does not match CACHE_NAME.
 */

const CACHE_NAME = 'typs-wasm-v1';

const WASM_ASSETS = [
  '/assets/typst_ts_web_compiler_bg.wasm',
  '/assets/typst_ts_renderer_bg.wasm',
];

// ── Install ───────────────────────────────────────────────────────────────────
// Pre-fetch and store both WASM files so the first compile does not hit the
// network. skipWaiting() activates the SW immediately without waiting for
// existing tabs to close.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(WASM_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Remove any caches from older SW versions, then take control of all open
// clients immediately (clients.claim) so the new SW serves requests right away.

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Intercept every .wasm request (from the main thread AND from the compiler
// Web Worker — dedicated workers are SW clients in modern browsers).
//
// Strategy: cache-first.
//  - Cache hit  → serve immediately with correct Content-Type.
//  - Cache miss → fetch from network, store, then serve with correct Content-Type.
//
// Rebuilding the Response object with a fixed Content-Type header is necessary
// because the cached (or network) response may carry application/octet-stream,
// which WebAssembly.compileStreaming() rejects.

self.addEventListener('fetch', (event) => {
  if (!event.request.url.endsWith('.wasm')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(event.request);

      if (hit) {
        return new Response(hit.body, {
          status:  hit.status,
          headers: new Headers({ 'Content-Type': 'application/wasm' }),
        });
      }

      // Cache miss (first load before install completes, or a new asset).
      const fresh = await fetch(event.request);
      if (fresh.ok) {
        // Store a clone so we can still read the body below.
        cache.put(event.request, fresh.clone());
      }
      return new Response(fresh.body, {
        status:  fresh.status,
        headers: new Headers({ 'Content-Type': 'application/wasm' }),
      });
    }),
  );
});
