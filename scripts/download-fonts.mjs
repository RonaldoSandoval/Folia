/**
 * Downloads the Typst bundled fonts from the official typst GitHub repository
 * via the jsDelivr CDN and saves them to public/assets/fonts/.
 *
 * Usage:
 *   node scripts/download-fonts.mjs
 *
 * The font names match the BUNDLED_FONTS list in compiler.worker.ts.
 * CDN base: https://cdn.jsdelivr.net/gh/typst/typst@v{VERSION}/crates/typst-assets/fonts/
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'fonts');

// typst-assets version — fonts live in a separate repo (typst/typst-assets).
// Served via jsDelivr CDN.
const TYPST_ASSETS_VERSION = '0.13.1';

// Must stay in sync with BUNDLED_FONTS in compiler.worker.ts
const FONTS = [
  // DejaVu Sans Mono
  'DejaVuSansMono.ttf',
  'DejaVuSansMono-Bold.ttf',
  'DejaVuSansMono-BoldOblique.ttf',
  'DejaVuSansMono-Oblique.ttf',

  // New Computer Modern (body text)
  'NewCM10-Regular.otf',
  'NewCM10-Bold.otf',
  'NewCM10-Italic.otf',
  'NewCM10-BoldItalic.otf',

  // New Computer Modern Math
  'NewCMMath-Regular.otf',
  'NewCMMath-Book.otf',
  'NewCMMath-Bold.otf',

  // Libertinus Serif (Typst default serif)
  'LibertinusSerif-Regular.otf',
  'LibertinusSerif-Bold.otf',
  'LibertinusSerif-Italic.otf',
  'LibertinusSerif-BoldItalic.otf',
  'LibertinusSerif-Semibold.otf',
  'LibertinusSerif-SemiboldItalic.otf',
];

// jsDelivr mirrors the typst/typst-assets GitHub repo where the bundled fonts
// are maintained separately from the main typst compiler repo.
const CDN_BASES = [
  `https://cdn.jsdelivr.net/gh/typst/typst-assets@v${TYPST_ASSETS_VERSION}/files/fonts`,
  `https://cdn.jsdelivr.net/gh/typst/typst-dev-assets@v${TYPST_ASSETS_VERSION}/files/fonts`,
];

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

let downloaded = 0;
let skipped = 0;
let failed = 0;

async function downloadFont(name) {
  const dest = join(OUT_DIR, name);
  if (existsSync(dest)) {
    console.log(`  skip  ${name}  (already exists)`);
    skipped++;
    return;
  }

  for (const base of CDN_BASES) {
    const url = `${base}/${name}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      writeFileSync(dest, Buffer.from(buf));
      console.log(`  ok    ${name}`);
      downloaded++;
      return;
    } catch {
      // try next CDN base
    }
  }

  console.error(`  FAIL  ${name}  (not found in any CDN base)`);
  failed++;
}

console.log(`Downloading ${FONTS.length} Typst fonts (assets v${TYPST_ASSETS_VERSION}) → ${OUT_DIR}\n`);

for (const font of FONTS) {
  await downloadFont(font);
}

console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`);
if (failed > 0) process.exit(1);
