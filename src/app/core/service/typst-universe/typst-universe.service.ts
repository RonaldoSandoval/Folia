import { Injectable } from '@angular/core';
import { extractTarGz } from './tar-extract';
import type { ProjectFile } from '../document/document.service';

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

/** Extensions treated as text and loaded as ProjectFiles. */
const TEXT_EXTS = new Set(['.typ', '.bib', '.csl', '.txt', '.toml', '.yaml', '.yml', '.json']);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TypstUniverseService {
  private indexCache: UniverseTemplate[] | null = null;
  private fileCache  = new Map<string, ProjectFile[]>();

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
   * text files that live inside the template's declared directory.
   * Results are cached per package version for the service lifetime.
   *
   * Some archives include a top-level `{name}-{version}/` directory component;
   * this is stripped automatically via `stripLeadingDir()`.
   */
  async downloadTemplate(t: UniverseTemplate): Promise<ProjectFile[]> {
    const key = `${t.name}@${t.version}`;
    if (this.fileCache.has(key)) return this.fileCache.get(key)!;

    const url      = `${PKG_BASE}/${t.name}-${t.version}.tar.gz`;
    const bytes    = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const allFiles = await extractTarGz(bytes);

    const dec         = new TextDecoder();
    const templateDir = t.template.path ? `${t.template.path}/` : '';
    const result: ProjectFile[] = [];

    for (const [rawPath, data] of allFiles) {
      const stripped = stripLeadingDir(rawPath);

      const ext = stripped.slice(stripped.lastIndexOf('.')).toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;

      if (!stripped.startsWith(templateDir)) continue;
      const relative = stripped.slice(templateDir.length);
      if (!relative) continue;

      result.push({ name: relative, content: dec.decode(data) });
    }

    // Ensure the declared entry-point file (usually main.typ) comes first.
    result.sort((a, b) => {
      if (a.name === t.template.entrypoint) return -1;
      if (b.name === t.template.entrypoint) return 1;
      return a.name.localeCompare(b.name);
    });

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
