/**
 * Extracts a .tar.gz archive in the browser using the native DecompressionStream
 * API (Chrome 80+, Firefox 113+, Safari 16.4+).
 *
 * Returns a Map of { virtualPath → raw bytes } for every regular file in the archive.
 */
export async function extractTarGz(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  // ── 1. Gunzip ──────────────────────────────────────────────────────────────
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  // Copy into a concrete ArrayBuffer — TypeScript requires ArrayBuffer, not ArrayBufferLike.
  writer.write(new Uint8Array(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const tar      = new Uint8Array(totalLen);
  let off = 0;
  for (const chunk of chunks) { tar.set(chunk, off); off += chunk.length; }

  // ── 2. Parse tar blocks ────────────────────────────────────────────────────
  const dec   = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let pos = 0;

  while (pos + 512 <= tar.length) {
    const hdr = tar.subarray(pos, pos + 512);

    // Two consecutive zero-filled blocks mark the end of the archive.
    if (hdr.every(b => b === 0)) break;

    // POSIX ustar paths: name (bytes 0–99) optionally prefixed by
    // the "prefix" field (bytes 345–499).
    const name   = dec.decode(hdr.subarray(0,   100)).replace(/\0.*/, '');
    const prefix = dec.decode(hdr.subarray(345, 500)).replace(/\0.*/, '');
    const path   = prefix ? `${prefix}/${name}` : name;

    // File size: 12-byte octal ASCII at byte 124.
    const sizeStr = dec.decode(hdr.subarray(124, 136)).replace(/\0.*/, '').trim();
    const size    = parseInt(sizeStr, 8) || 0;

    // Type flag at byte 156: '0' or NUL = regular file; '5' = directory.
    const type = String.fromCharCode(hdr[156]);
    pos += 512;

    if ((type === '0' || type === '\0') && size > 0) {
      files.set(path, tar.slice(pos, pos + size));
    }

    pos += Math.ceil(size / 512) * 512;
  }

  return files;
}
