import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase.client';
import { ToastService } from '../toast/toast.service';
import type { DocumentItem } from '../../../shared/components/document-list/document-list';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single file within a Typst project. */
export interface ProjectFile {
  name: string;
  content: string;
  /** When true this entry is a project-level folder, not a .typ source file. */
  isFolder?: true;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: Date;
  /** False when this folder belongs to another user (e.g. contains a shared doc). */
  isOwned: boolean;
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
  /** False when this document was shared with the current user by someone else. */
  isOwned: boolean;
  /** True when the document has at least one collaborator. */
  hasCollaborators: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT = '';

const SELECT = 'id, title, content, files, active_file, folder_id, updated_at, owner_id, thumbnail_url, document_collaborators(id)' as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  title: string;
  content: string;
  files: ProjectFile[];
  active_file: string;
  folder_id: string | null;
  updated_at: string;
  owner_id: string;
  thumbnail_url: string | null;
  document_collaborators: { id: string }[];
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  updated_at: string;
  owner_id: string;
}

function mapRow(row: DocumentRow, currentUserId?: string): Document {
  return {
    id:                row.id,
    title:             row.title,
    content:           row.content ?? '',
    files:             (row.files as ProjectFile[]) ?? [{ name: 'main.typ', content: row.content ?? '' }],
    activeFile:        row.active_file ?? 'main.typ',
    folderId:          row.folder_id ?? null,
    updatedAt:         new Date(row.updated_at),
    isOwned:           currentUserId ? row.owner_id === currentUserId : true,
    hasCollaborators:  (row.document_collaborators?.length ?? 0) > 0,
    thumbnailUrl:      row.thumbnail_url ?? null,
  };
}

function mapFolderRow(row: FolderRow, currentUserId?: string): FolderItem {
  return {
    id:        row.id,
    name:      row.name,
    parentId:  row.parent_id ?? null,
    updatedAt: new Date(row.updated_at),
    isOwned:   currentUserId ? row.owner_id === currentUserId : true,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DocumentService {
  private readonly supabase   = inject(SUPABASE);
  readonly         auth       = inject(AuthService);
  private readonly router     = inject(Router);
  private readonly toast      = inject(ToastService);

  /** Documents are fetched in pages of this size. */
  private static readonly PAGE_SIZE = 20;
  /** Index of the last page fetched (0-based). Resets on full reload. */
  private _currentPage = 0;

  private readonly _documents      = signal<Document[]>([]);
  private readonly _folders        = signal<FolderItem[]>([]);
  private readonly _isLoading      = signal(false);
  private readonly _hasMore        = signal(false);
  private readonly _isLoadingMore  = signal(false);

  // ── Public reactive state ─────────────────────────────────────────────────

  /** Reactive list of document summaries consumed by AppShell / DocumentList. */
  readonly documents = computed<DocumentItem[]>(() =>
    this._documents().map(({ id, title, updatedAt, folderId, isOwned, hasCollaborators, thumbnailUrl }) => ({
      id, title, updatedAt, folderId, isOwned, hasCollaborators, thumbnailUrl,
    })),
  );

  readonly folders        = this._folders.asReadonly();
  /** True while the initial documents + folders fetch is in progress. */
  readonly isLoading      = this._isLoading.asReadonly();
  /** True when there are additional pages of documents available to load. */
  readonly hasMore        = this._hasMore.asReadonly();
  /** True while a "load more" fetch is in progress. */
  readonly isLoadingMore  = this._isLoadingMore.asReadonly();

  private sharedDocsChannel: ReturnType<typeof this.supabase.channel> | null = null;

  constructor() {
    // Reload documents whenever auth state changes.
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this._isLoading.set(true);
        this.loadAll().finally(() => this._isLoading.set(false));
        this.subscribeToSharedDocChanges(user.id);
      } else {
        this._documents.set([]);
        this._folders.set([]);
        if (this.sharedDocsChannel) {
          void this.supabase.removeChannel(this.sharedDocsChannel);
          this.sharedDocsChannel = null;
        }
      }
    });
  }

  /** Listens for new documents shared with the current user and refreshes the list. */
  private subscribeToSharedDocChanges(userId: string): void {
    if (this.sharedDocsChannel) {
      void this.supabase.removeChannel(this.sharedDocsChannel);
    }
    this.sharedDocsChannel = this.supabase
      .channel('shared-docs-watcher')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'document_collaborators',
          filter: `user_id=eq.${userId}`,
        },
        () => this.loadAll(),
      )
      .subscribe();
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

    const doc = mapRow(data as DocumentRow, this.auth.user()?.id);
    this._documents.update((docs) =>
      docs.some((d) => d.id === id) ? docs : [doc, ...docs],
    );
    return doc;
  }

  // ── Document CRUD ─────────────────────────────────────────────────────────

  async create(
    title = 'Sin título',
    folderId: string | null = null,
    initialFiles?: ProjectFile[],
  ): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const files       = initialFiles?.length ? initialFiles : [{ name: 'main.typ', content: DEFAULT_CONTENT }];
    const activeFile  = files[0].name;
    const content     = files[0].content;

    const { data, error } = await this.supabase
      .from('documents')
      .insert({
        owner_id:    user.id,
        title:       title.trim() || 'Sin título',
        content,
        files,
        active_file: activeFile,
        folder_id:   folderId,
      })
      .select(SELECT)
      .single();

    if (error || !data) {
      this.toast.error('No se pudo crear el documento. Intenta de nuevo.');
      return;
    }

    const doc = mapRow(data as DocumentRow);
    this._documents.update((docs) => [doc, ...docs]);
    await this.router.navigate(['/project', doc.id]);
  }

  /**
   * Persists the thumbnail URL returned by AssetService after a successful upload.
   * Updates the in-memory cache immediately so cards in AppShell refresh without
   * a full page reload.
   */
  saveThumbnailUrl(id: string, url: string): void {
    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, thumbnailUrl: url } : d)),
    );
    void this.supabase
      .from('documents')
      .update({ thumbnail_url: url })
      .eq('id', id)
      .then(() => {});
  }

  /**
   * Syncs the final Yjs text back to the `content` column and the in-memory cache
   * when leaving a collaborative session. Only updates `content` — does NOT touch
   * `files`, to avoid overwriting concurrent collaborator file additions.
   */
  syncCollabContent(id: string, content: string): void {
    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, content } : d)),
    );
    // .then() is required — PostgrestFilterBuilder is lazy and only executes on thenable call.
    void this.supabase
      .from('documents')
      .update({ content })
      .eq('id', id)
      .then(() => {});
  }

  /** Saves the content of the active file. Optimistic update + background persist. */
  async saveContent(id: string, content: string): Promise<{ error: string | null }> {
    const doc = this.getById(id);
    if (!doc) return { error: 'Document not found' };

    const files = doc.files.map((f) =>
      f.name === doc.activeFile ? { ...f, content } : f,
    );

    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, content, files, updatedAt: new Date() } : d)),
    );

    const { error } = await this.supabase
      .from('documents')
      .update({ content, files })
      .eq('id', id);

    return { error: error?.message ?? null };
  }

  /** Renames a document. Ignores empty or whitespace-only titles. */
  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;

    const prev = this._documents().find((d) => d.id === id)?.title;
    this._documents.update((docs) =>
      docs.map((d) => (d.id === id ? { ...d, title: trimmed, updatedAt: new Date() } : d)),
    );

    const { error } = await this.supabase
      .from('documents')
      .update({ title: trimmed })
      .eq('id', id);

    if (error) {
      // Revert optimistic update.
      if (prev !== undefined) {
        this._documents.update((docs) =>
          docs.map((d) => (d.id === id ? { ...d, title: prev } : d)),
        );
      }
      this.toast.error('No se pudo renombrar el documento.');
    }
  }

  async delete(id: string): Promise<void> {
    const prev = this._documents().find((d) => d.id === id);
    this._documents.update((docs) => docs.filter((d) => d.id !== id));

    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      if (prev) this._documents.update((docs) => [prev, ...docs]);
      this.toast.error('No se pudo eliminar el documento.');
    }
  }

  async moveDocument(docId: string, folderId: string | null): Promise<void> {
    const prevFolderId = this._documents().find((d) => d.id === docId)?.folderId ?? null;
    this._documents.update((docs) =>
      docs.map((d) => (d.id === docId ? { ...d, folderId } : d)),
    );

    const { error } = await this.supabase
      .from('documents')
      .update({ folder_id: folderId })
      .eq('id', docId);

    if (error) {
      this._documents.update((docs) =>
        docs.map((d) => (d.id === docId ? { ...d, folderId: prevFolderId } : d)),
      );
      this.toast.error('No se pudo mover el documento.');
    }
  }

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  async createFolder(name: string, parentId: string | null = null): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const { data, error } = await this.supabase
      .from('folders')
      .insert({ owner_id: user.id, name: trimmed, parent_id: parentId })
      .select('id, name, parent_id, updated_at, owner_id')
      .single();

    if (error || !data) {
      this.toast.error('No se pudo crear la carpeta. Intenta de nuevo.');
      return;
    }

    this._folders.update((fs) => [mapFolderRow(data as FolderRow, user.id), ...fs]);
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;

    const prev = this._folders().find((f) => f.id === id)?.name;
    this._folders.update((fs) =>
      fs.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
    );

    const { error } = await this.supabase
      .from('folders')
      .update({ name: trimmed })
      .eq('id', id);

    if (error) {
      if (prev !== undefined) {
        this._folders.update((fs) =>
          fs.map((f) => (f.id === id ? { ...f, name: prev } : f)),
        );
      }
      this.toast.error('No se pudo renombrar la carpeta.');
    }
  }

  async deleteFolder(id: string): Promise<void> {
    // Collect the full subtree: the folder itself + all descendants.
    const subtreeIds = this.collectFolderSubtree(id);

    // Snapshot for rollback.
    const prevDocs    = this._documents();
    const prevFolders = this._folders();

    // Delete all documents inside those folders from Supabase first
    // (before the folder is deleted, to avoid race with on-delete-set-null).
    const { error: docsError } = await this.supabase
      .from('documents')
      .delete()
      .in('folder_id', subtreeIds);

    if (docsError) {
      this.toast.error('No se pudo eliminar los documentos de la carpeta.');
      return;
    }

    // Remove those documents from local state.
    this._documents.update((docs) =>
      docs.filter((d) => !subtreeIds.includes(d.folderId ?? '')),
    );

    // Remove all folders in the subtree from local state.
    this._folders.update((fs) =>
      fs.filter((f) => !subtreeIds.includes(f.id)),
    );

    // Delete the root folder — DB cascade removes any remaining child folders.
    const { error: folderError } = await this.supabase
      .from('folders')
      .delete()
      .eq('id', id);

    if (folderError) {
      this._documents.set(prevDocs);
      this._folders.set(prevFolders);
      this.toast.error('No se pudo eliminar la carpeta.');
    }
  }

  /**
   * Returns the IDs of a folder and all its descendants (depth-first).
   * Reads from the current in-memory `_folders` signal.
   */
  private collectFolderSubtree(folderId: string): string[] {
    const result: string[] = [folderId];
    for (const child of this._folders().filter((f) => f.parentId === folderId)) {
      result.push(...this.collectFolderSubtree(child.id));
    }
    return result;
  }

  // ── Multi-file ────────────────────────────────────────────────────────────

  async renameFile(docId: string, oldName: string, newName: string): Promise<void> {
    const trimmed   = newName.trim();
    const fileName  = trimmed.endsWith('.typ') ? trimmed : `${trimmed}.typ`;
    if (!fileName || fileName === oldName) return;

    const doc = this.getById(docId);
    if (!doc) return;
    if (doc.files.some((f) => f.name === fileName)) return;

    const files      = doc.files.map((f) => f.name === oldName ? { ...f, name: fileName } : f);
    const activeFile = doc.activeFile === oldName ? fileName : doc.activeFile;

    this._documents.update((docs) =>
      docs.map((d) => d.id === docId ? { ...d, files, activeFile } : d),
    );

    await this.supabase
      .from('documents')
      .update({ files, active_file: activeFile })
      .eq('id', docId);
  }

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
    if (!doc || doc.files.filter((f) => !f.isFolder).length <= 1) return;

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

  // ── Project-folder CRUD ───────────────────────────────────────────────────

  /** Creates a folder entry inside the project's file list. */
  async addProjectFolder(docId: string, folderName: string): Promise<void> {
    const trimmed = folderName.trim();
    if (!trimmed) return;

    const doc = this.getById(docId);
    if (!doc || doc.files.some((f) => f.isFolder && f.name === trimmed)) return;

    const files = [...doc.files, { name: trimmed, content: '', isFolder: true as const }];
    this._documents.update((docs) => docs.map((d) => (d.id === docId ? { ...d, files } : d)));

    await this.supabase.from('documents').update({ files }).eq('id', docId);
  }

  /** Renames a project folder and updates all file paths inside it. */
  async renameProjectFolder(docId: string, oldName: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;

    const doc = this.getById(docId);
    if (!doc) return;

    const files = doc.files.map((f) => {
      if (f.isFolder && f.name === oldName) return { ...f, name: trimmed };
      if (!f.isFolder && f.name.startsWith(`${oldName}/`))
        return { ...f, name: trimmed + f.name.slice(oldName.length) };
      return f;
    });

    const activeFile = doc.activeFile.startsWith(`${oldName}/`)
      ? trimmed + doc.activeFile.slice(oldName.length)
      : doc.activeFile;

    this._documents.update((docs) =>
      docs.map((d) => (d.id === docId ? { ...d, files, activeFile } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ files, active_file: activeFile })
      .eq('id', docId);
  }

  /** Deletes a project folder and all .typ files inside it. */
  async deleteProjectFolder(docId: string, folderName: string): Promise<void> {
    const doc = this.getById(docId);
    if (!doc) return;

    const files = doc.files.filter(
      (f) => !(f.isFolder && f.name === folderName) && !f.name.startsWith(`${folderName}/`),
    );

    // If the active file lived in the deleted folder, fall back to first .typ file.
    const activeInDeleted = doc.activeFile.startsWith(`${folderName}/`);
    const activeFile = activeInDeleted
      ? (files.find((f) => !f.isFolder)?.name ?? 'main.typ')
      : doc.activeFile;
    const content = files.find((f) => f.name === activeFile)?.content ?? '';

    this._documents.update((docs) =>
      docs.map((d) => (d.id === docId ? { ...d, files, activeFile, content } : d)),
    );

    await this.supabase
      .from('documents')
      .update({ files, active_file: activeFile, content })
      .eq('id', docId);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Loads the first page of documents and all folders.
   * Called on initial load and whenever auth state changes.
   */
  private async loadAll(): Promise<void> {
    this._currentPage = 0;
    const userId      = this.auth.user()?.id;
    const pageSize    = DocumentService.PAGE_SIZE;

    // Fetch PAGE_SIZE + 1 docs (the extra row tells us whether more pages exist)
    // and all folders in parallel.
    const [docsRes, foldersRes] = await Promise.all([
      this.supabase
        .from('documents')
        .select(SELECT)
        .order('updated_at', { ascending: false })
        .range(0, pageSize),                          // range is inclusive → pageSize+1 rows max
      this.supabase
        .from('folders')
        .select('id, name, parent_id, updated_at, owner_id')
        .order('name', { ascending: true }),
    ]);

    const allRows = (docsRes.data ?? []) as DocumentRow[];
    const hasMore = allRows.length > pageSize;
    const docs    = (hasMore ? allRows.slice(0, pageSize) : allRows).map((r) => mapRow(r, userId));

    this._hasMore.set(hasMore);

    // Build folder map from own folders.
    const folderMap = new Map<string, FolderItem>();
    if (!foldersRes.error) {
      for (const row of foldersRes.data as FolderRow[]) {
        folderMap.set(row.id, mapFolderRow(row, userId));
      }
    }

    // Fetch folders referenced by shared docs that aren't visible yet (RLS gap).
    await this.fetchMissingFolders(docs, folderMap);

    this._documents.set(docs);
    this._folders.set([...folderMap.values()]);
  }

  /**
   * Appends the next page of documents to the existing list.
   * No-op when there are no more pages or a fetch is already in progress.
   */
  async loadMoreDocuments(): Promise<void> {
    if (!this._hasMore() || this._isLoadingMore()) return;
    this._isLoadingMore.set(true);

    try {
      this._currentPage++;
      const userId   = this.auth.user()?.id;
      const pageSize = DocumentService.PAGE_SIZE;
      const from     = this._currentPage * pageSize;

      const { data, error } = await this.supabase
        .from('documents')
        .select(SELECT)
        .order('updated_at', { ascending: false })
        .range(from, from + pageSize);            // inclusive → pageSize+1 rows max

      if (error) {
        this._currentPage--;                       // revert so the next attempt retries the same page
        this.toast.error('No se pudieron cargar más documentos.');
        return;
      }

      const allRows = (data ?? []) as DocumentRow[];
      const hasMore = allRows.length > pageSize;
      const newDocs = (hasMore ? allRows.slice(0, pageSize) : allRows).map((r) => mapRow(r, userId));

      this._hasMore.set(hasMore);

      // Resolve any new folder references introduced by this page.
      const folderMap = new Map(this._folders().map((f) => [f.id, f]));
      await this.fetchMissingFolders(newDocs, folderMap);
      this._folders.set([...folderMap.values()]);

      this._documents.update((prev) => [...prev, ...newDocs]);
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  /**
   * Iteratively fetches folders that are referenced by `docs` but absent from
   * `folderMap`, including their ancestor chain (for nested shared folders).
   * Mutates `folderMap` in place so callers can flush it to `_folders` afterward.
   */
  private async fetchMissingFolders(
    docs: Document[],
    folderMap: Map<string, FolderItem>,
  ): Promise<void> {
    const userId = this.auth.user()?.id;

    let missingIds = [
      ...new Set(
        docs
          .filter((d) => !d.isOwned && d.folderId && !folderMap.has(d.folderId))
          .map((d) => d.folderId!),
      ),
    ];

    while (missingIds.length > 0) {
      const { data } = await this.supabase
        .from('folders')
        .select('id, name, parent_id, updated_at, owner_id')
        .in('id', missingIds);

      if (!data?.length) break;

      const nextMissing: string[] = [];
      for (const row of data as FolderRow[]) {
        folderMap.set(row.id, mapFolderRow(row, userId));
        if (row.parent_id && !folderMap.has(row.parent_id)) {
          nextMissing.push(row.parent_id);
        }
      }
      missingIds = [...new Set(nextMissing)];
    }
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideDocumentService() {
  return { provide: DocumentService, useClass: DocumentService };
}
