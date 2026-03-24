import { Injectable } from '@angular/core';
import { extractTarGz } from './tar-extract';
import type { ProjectFile, ProjectAsset } from '../document/document.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UniverseTemplate {
  name:        string;
  version:     string;
  description: string;
  categories:  string[];
  keywords:    string[];
  template: {
    /** Directory inside the package that holds the template files, e.g. "template". */
    path:       string;
    /** Entry-point filename relative to `path`, e.g. "main.typ". */
    entrypoint: string;
    /** Thumbnail filename relative to the package root, e.g. "thumbnail.png". */
    thumbnail:  string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDEX_URL = 'https://packages.typst.org/preview/index.json';
const PKG_BASE  = 'https://packages.typst.org/preview';
const RAW_BASE  = 'https://raw.githubusercontent.com/typst/packages/main/packages/preview';

/** Extensions treated as text and stored as ProjectFiles in the DB. */
const TEXT_EXTS = new Set(['.typ', '.bib', '.csl', '.txt', '.toml', '.yaml', '.yml', '.json', '.svg']);

/** Extensions treated as binary assets uploaded to Storage. */
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ttf', '.otf', '.woff', '.woff2', '.pdf']);

/** Result returned by {@link TypstUniverseService.downloadTemplate}. */
export interface TemplateDownloadResult {
  /** Text source files to persist in the `files` JSON column. */
  files: ProjectFile[];
  /** Binary assets to upload to Supabase Storage. */
  assets: ProjectAsset[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TypstUniverseService {
  private indexCache: UniverseTemplate[] | null = null;
  private fileCache  = new Map<string, TemplateDownloadResult>();

  /**
   * Fetches the Typst Universe package index and returns only the packages that
   * declare a `[template]` section, deduplicated to the latest version per name.
   * The result is cached for the lifetime of this service instance.
   */
  async getTemplates(): Promise<UniverseTemplate[]> {
    if (this.indexCache) return this.indexCache;

    const res = await fetch(INDEX_URL);
    const all = (await res.json()) as Record<string, unknown>[];

    const byName = new Map<string, UniverseTemplate>();
    for (const pkg of all) {
      if (!pkg['template']) continue;
      const entry = pkg as unknown as UniverseTemplate;
      const existing = byName.get(entry.name);
      if (!existing || semverGt(entry.version, existing.version)) {
        byName.set(entry.name, entry);
      }
    }

    this.indexCache = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return this.indexCache;
  }

  /**
   * Downloads the package `.tar.gz` from packages.typst.org and extracts all
   * files that live inside the template's declared directory.
   *
   * - Text files (`.typ`, `.bib`, `.svg`, etc.) are returned as `ProjectFile[]`
   *   and persisted in the DB `files` column.
   * - Binary files (`.png`, `.ttf`, etc.) are returned as `ProjectAsset[]` and
   *   uploaded to Supabase Storage so they survive across sessions.
   * - `isFolder: true` entries are automatically inferred from nested paths so
   *   the files sidebar renders the correct tree structure.
   *
   * Results are cached per package version for the service lifetime.
   * Some archives include a top-level `{name}-{version}/` directory component;
   * this is stripped automatically via `stripLeadingDir()`.
   */
  async downloadTemplate(t: UniverseTemplate): Promise<TemplateDownloadResult> {
    const key = `${t.name}@${t.version}`;
    if (this.fileCache.has(key)) return this.fileCache.get(key)!;

    const url      = `${PKG_BASE}/${t.name}-${t.version}.tar.gz`;
    const bytes    = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const allFiles = await extractTarGz(bytes);

    const dec         = new TextDecoder();
    const templateDir = t.template.path ? `${t.template.path}/` : '';
    const files:  ProjectFile[]  = [];
    const assets: ProjectAsset[] = [];

    for (const [rawPath, data] of allFiles) {
      const stripped = stripLeadingDir(rawPath);
      if (!stripped.startsWith(templateDir)) continue;
      const relative = stripped.slice(templateDir.length);
      if (!relative) continue;

      const ext = relative.slice(relative.lastIndexOf('.')).toLowerCase();

      if (TEXT_EXTS.has(ext)) {
        files.push({ name: relative, content: dec.decode(data) });
      } else if (BINARY_EXTS.has(ext)) {
        assets.push({ name: relative, data: new Uint8Array(data) });
      }
    }

    // Infer folder entries from nested paths (both text and binary files).
    const allNames = [...files.map((f) => f.name), ...assets.map((a) => a.name)];
    for (const folderPath of inferFolders(allNames)) {
      files.push({ name: folderPath, content: '', isFolder: true });
    }

    // Ensure the declared entry-point file (usually main.typ) comes first.
    files.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return 1;
      if (!a.isFolder && b.isFolder) return -1;
      if (a.name === t.template.entrypoint) return -1;
      if (b.name === t.template.entrypoint) return 1;
      return a.name.localeCompare(b.name);
    });

    const result: TemplateDownloadResult = { files, assets };
    this.fileCache.set(key, result);
    return result;
  }

  /** Returns the GitHub raw URL for a template's thumbnail image. */
  thumbnailUrl(t: UniverseTemplate): string {
    return `${RAW_BASE}/${t.name}/${t.version}/${t.template.thumbnail}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns every unique parent path for a list of file names.
 * e.g. ["assets/images/logo.png"] → ["assets", "assets/images"]
 */
function inferFolders(names: string[]): string[] {
  const folders = new Set<string>();
  for (const name of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  }
  return [...folders].sort();
}

/**
 * Strips an optional top-level directory component from a tar path.
 * The heuristic: if the first path segment contains a digit (typical of
 * `{name}-{version}` prefixes), it is removed.
 *
 * Examples:
 *   "charged-ieee-0.1.3/template/main.typ" → "template/main.typ"
 *   "template/main.typ"                    → "template/main.typ"
 *   "src/lib.typ"                          → "src/lib.typ"
 */
function stripLeadingDir(path: string): string {
  const slash = path.indexOf('/');
  if (slash > 0) {
    const firstSegment = path.slice(0, slash);
    if (/\d/.test(firstSegment)) {
      return path.slice(slash + 1);
    }
  }
  return path;
}

/** Returns true when semver string `a` is greater than `b`. */
function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideTypstUniverseService() {
  return { provide: TypstUniverseService, useClass: TypstUniverseService };
}
