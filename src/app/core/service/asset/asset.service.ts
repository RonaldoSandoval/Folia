import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Handles Supabase Storage for two buckets:
 *
 *  - `project-assets`      (private)  — images uploaded inside the editor.
 *    Path structure: `{docId}/images/{name}` where `name` may contain `/`
 *    for sub-folder organisation (e.g. `figures/chart.png`).
 *
 *  - `document-thumbnails` (public)   — first-page PNG preview generated on save.
 *    Path structure: `{docId}/thumbnail.png`
 *    The bucket is public so `getPublicUrl()` returns a permanent URL with
 *    no expiry — safe to persist in the `documents.thumbnail_url` column.
 */
@Injectable()
export class AssetService {
  private readonly supabase = inject(SUPABASE);

  private static readonly IMAGES_BUCKET = 'project-assets';

  // ── Images ─────────────────────────────────────────────────────────────────

  /**
   * Uploads an image to `project-assets/{docId}/images/{name}`.
   * Uses `upsert: true` so re-uploading the same filename overwrites silently.
   */
  async uploadImage(docId: string, name: string, data: Uint8Array): Promise<void> {
    await this.supabase.storage
      .from(AssetService.IMAGES_BUCKET)
      .upload(`${docId}/images/${name}`, data, {
        upsert:      true,
        contentType: mimeType(name),
      });
  }

  /**
   * Downloads all images stored under `project-assets/{docId}/images/`.
   * Returns raw bytes so the caller can:
   *   1. Register them in the Typst compiler virtual filesystem.
   *   2. Create blob URLs for the FilesSidebar preview.
   *
   * Downloads run in parallel for performance.
   */
  async loadImages(docId: string): Promise<{ name: string; data: Uint8Array }[]> {
    const prefix = `${docId}/images/`;
    const paths  = await this.listAll(AssetService.IMAGES_BUCKET, prefix);
    if (!paths.length) return [];

    const settled = await Promise.allSettled(
      paths.map(async (path) => {
        const { data } = await this.supabase.storage
          .from(AssetService.IMAGES_BUCKET)
          .download(path);
        if (!data) return null;
        const buf = await data.arrayBuffer();
        return { name: path.slice(prefix.length), data: new Uint8Array(buf) };
      }),
    );

    return settled
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<{ name: string; data: Uint8Array }>).value);
  }

  /** Removes `project-assets/{docId}/images/{name}` from Storage. */
  async deleteImage(docId: string, name: string): Promise<void> {
    await this.supabase.storage
      .from(AssetService.IMAGES_BUCKET)
      .remove([`${docId}/images/${name}`]);
  }

  /**
   * Renames (moves) a project image.
   * Supabase Storage `move()` is atomic — no manual copy+delete needed.
   */
  async renameImage(docId: string, oldName: string, newName: string): Promise<void> {
    await this.supabase.storage
      .from(AssetService.IMAGES_BUCKET)
      .move(`${docId}/images/${oldName}`, `${docId}/images/${newName}`);
  }

  // ── Thumbnails ─────────────────────────────────────────────────────────────

  /**
   * Converts the thumbnail blob to a base64 data URL so it can be stored
   * directly in `documents.thumbnail_url` — no Storage bucket required.
   *
   * A 200-px JPEG at 0.5 quality is ~5–15 KB (7–20 KB as base64), small
   * enough to be included inline in document-list queries.
   *
   * @returns A `data:image/jpeg;base64,…` string, or `null` on failure.
   */
  uploadThumbnail(_docId: string, blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const reader   = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Recursively lists all file paths under `prefix` in `bucket`.
   * Supabase Storage `list()` is single-level; sub-folders appear as items
   * without an `id`. This method recurses into those pseudo-folders so the
   * full path tree is returned (matching compiler virtual filesystem paths).
   */
  private async listAll(bucket: string, prefix: string): Promise<string[]> {
    const { data } = await this.supabase.storage.from(bucket).list(prefix);
    const paths: string[] = [];

    await Promise.all(
      (data ?? []).map(async (item) => {
        if (item.id) {
          paths.push(`${prefix}${item.name}`);
        } else {
          const nested = await this.listAll(bucket, `${prefix}${item.name}/`);
          paths.push(...nested);
        }
      }),
    );

    return paths;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mimeType(name: string): string {
  switch (name.toLowerCase().split('.').pop()) {
    case 'png':          return 'image/png';
    case 'jpg':
    case 'jpeg':         return 'image/jpeg';
    case 'gif':          return 'image/gif';
    case 'webp':         return 'image/webp';
    case 'svg':          return 'image/svg+xml';
    default:             return 'application/octet-stream';
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideAssetService() {
  return { provide: AssetService, useClass: AssetService };
}
