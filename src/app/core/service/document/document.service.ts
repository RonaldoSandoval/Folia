import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase.client';
import type { DocumentItem } from '../../../shared/components/document-list/document-list';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single file within a Typst project. */
export interface ProjectFile {
  name: string;
  content: string;
}

/**
 * Full document stored in Supabase.
 * Extends `DocumentItem` so existing components (DocumentList, AppShell)
 * receive a compatible shape without any changes.
 */
export interface Document extends DocumentItem {
  /** Content of the currently active file (kept in sync with `files`). */
  content: string;
  /** All files belonging to this project. */
  files: ProjectFile[];
  /** Name of the currently active file. */
  activeFile: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT = '= Sin título\n\nEscribe tu contenido Typst aquí.\n';

const SELECT = 'id, title, content, files, active_file, updated_at' as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  title: string;
  content: string;
  files: ProjectFile[];
  active_file: string;
  updated_at: string;
}

function mapRow(row: DocumentRow): Document {
  return {
    id:         row.id,
    title:      row.title,
    content:    row.content ?? '',
    files:      (row.files as ProjectFile[]) ?? [{ name: 'main.typ', content: row.content ?? '' }],
    activeFile: row.active_file ?? 'main.typ',
    updatedAt:  new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth     = inject(AuthService);
  private readonly router   = inject(Router);

  private readonly _documents = signal<Document[]>([]);

  // ── Public reactive state ─────────────────────────────────────────────────

  /** Reactive list of document summaries consumed by AppShell / DocumentList. */
  readonly documents = computed<DocumentItem[]>(() =>
    this._documents().map(({ id, title, updatedAt }) => ({ id, title, updatedAt })),
  );

  constructor() {
    // Reload documents whenever auth state changes.
    effect(() => {
      if (this.auth.user()) {
        this.loadAll();
      } else {
        this._documents.set([]);
      }
    });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** Returns the full document from the in-memory cache, or `undefined`. */
  getById(id: string): Document | undefined {
    return this._documents().find((d) => d.id === id);
  }

  /**
   * Fetches a single document from Supabase and caches it.
   * Used when the user opens a document directly via URL (cache miss on reload).
   */
  async fetchById(id: string): Promise<Document | undefined> {
    const { data } = await this.supabase
      .from('documents')
      .select(SELECT)
      .eq('id', id)
      .single();

    if (!data) return undefined;

    const doc = mapRow(data as DocumentRow);
    this._documents.update((docs) =>
      docs.some((d) => d.id === id) ? docs : [doc, ...docs],
    );
    return doc;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const defaultFile: ProjectFile = { name: 'main.typ', content: DEFAULT_CONTENT };

    const { data, error } = await this.supabase
      .from('documents')
      .insert({
        owner_id:    user.id,
        title:       'Sin título',
        content:     DEFAULT_CONTENT,
        files:       [defaultFile],
        active_file: 'main.typ',
      })
      .select(SELECT)
      .single();

    if (error || !data) {
      console.error('[DocumentService] create:', error?.message);
      return;
    }

    const doc = mapRow(data as DocumentRow);
    this._documents.update((docs) => [doc, ...docs]);
    await this.router.navigate(['/project', doc.id]);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /** Saves the content of the active file. Optimistic update + background persist. */
  async saveContent(id: string, content: string): Promise<void> {
    const doc = this.getById(id);
    if (!doc) return;

    const files = doc.files.map((f) =>
      f.name === doc.activeFile ? { ...f, content } : f,
    );

    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, content, files, updatedAt: new Date() } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ content, files })
      .eq('id', id);
  }

  /** Renames a document. Ignores empty or whitespace-only titles. */
  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;

    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, title: trimmed, updatedAt: new Date() } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ title: trimmed })
      .eq('id', id);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    this._documents.update((docs) => docs.filter((d) => d.id !== id));

    await this.supabase
      .from('documents')
      .delete()
      .eq('id', id);
  }

  // ── Multi-file ────────────────────────────────────────────────────────────

  async addFile(docId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;

    const doc = this.getById(docId);
    if (!doc || doc.files.some((f) => f.name === trimmed)) return;

    const files = [...doc.files, { name: trimmed, content: '' }];
    this._documents.update((docs) =>
      docs.map((d) => (d.id === docId ? { ...d, files } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ files })
      .eq('id', docId);
  }

  async deleteFile(docId: string, fileName: string): Promise<void> {
    const doc = this.getById(docId);
    if (!doc || doc.files.length <= 1) return;

    const files      = doc.files.filter((f) => f.name !== fileName);
    const activeFile = doc.activeFile === fileName ? files[0].name : doc.activeFile;
    const content    = files.find((f) => f.name === activeFile)?.content ?? '';

    this._documents.update((docs) =>
      docs.map((d) => (d.id === docId ? { ...d, files, activeFile, content } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ files, active_file: activeFile, content })
      .eq('id', docId);
  }

  async switchFile(docId: string, fileName: string): Promise<void> {
    const doc = this.getById(docId);
    if (!doc) return;

    const file = doc.files.find((f) => f.name === fileName);
    if (!file) return;

    this._documents.update((docs) =>
      docs.map((d) =>
        d.id === docId ? { ...d, activeFile: fileName, content: file.content } : d,
      ),
    );

    await this.supabase
      .from('documents')
      .update({ active_file: fileName, content: file.content })
      .eq('id', docId);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async loadAll(): Promise<void> {
    const { data, error } = await this.supabase
      .from('documents')
      .select(SELECT)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[DocumentService] loadAll:', error.message);
      return;
    }

    this._documents.set((data as DocumentRow[]).map(mapRow));
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideDocumentService() {
  return { provide: DocumentService, useClass: DocumentService };
}
