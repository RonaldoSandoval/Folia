import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase.client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CollaboratorRole = 'viewer' | 'editor' | 'admin';

export interface Collaborator {
  userId:      string;
  role:        CollaboratorRole;
  displayName: string;
  email:       string;
  avatarUrl:   string | null;
}

export interface ProfileResult {
  id:          string;
  full_name:   string;
  email:       string;
  avatar_url:  string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CollaborationService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth     = inject(AuthService);

  private readonly _collaborators = signal<Collaborator[]>([]);
  readonly collaborators = this._collaborators.asReadonly();

  // ── Role ──────────────────────────────────────────────────────────────────

  /**
   * Returns the current user's role in the given document.
   * 'owner' means the user owns the document and is not in collaborators.
   */
  async loadRole(docId: string): Promise<'owner' | CollaboratorRole> {
    const userId = this.auth.user()?.id;
    if (!userId) return 'viewer';

    const { data: doc } = await this.supabase
      .from('documents')
      .select('owner_id')
      .eq('id', docId)
      .single();

    if (doc?.owner_id === userId) return 'owner';

    const { data: collab } = await this.supabase
      .from('document_collaborators')
      .select('role')
      .eq('document_id', docId)
      .eq('user_id', userId)
      .single();

    return (collab?.role as CollaboratorRole | undefined) ?? 'viewer';
  }

  // ── Collaborators CRUD ────────────────────────────────────────────────────

  async loadCollaborators(docId: string): Promise<void> {
    // Uses a SECURITY DEFINER RPC so both owners and collaborators
    // can see the full collaborator list (RLS would limit non-owners to own row).
    const { data, error } = await this.supabase.rpc('get_document_collaborators', { doc_id: docId });

    if (!error && data) {
      this._collaborators.set(
        (data as any[]).map((row) => ({
          userId:      row.user_id,
          role:        row.role as CollaboratorRole,
          displayName: row.full_name  ?? 'Usuario',
          email:       row.email      ?? '',
          avatarUrl:   row.avatar_url ?? null,
        })),
      );
      return;
    }

    // Fallback: direct query (works for document owners; RLS may limit non-owners).
    // RPC unavailable — falling back to direct query.
    const { data: rows } = await this.supabase
      .from('document_collaborators')
      .select('user_id, role')
      .eq('document_id', docId);

    if (!rows?.length) {
      this._collaborators.set([]);
      return;
    }

    const profiles = await Promise.all(rows.map((r) => this.getProfile(r.user_id)));
    this._collaborators.set(
      rows.map((row, i) => ({
        userId:      row.user_id,
        role:        row.role as CollaboratorRole,
        displayName: profiles[i]?.full_name ?? 'Usuario',
        email:       profiles[i]?.email     ?? '',
        avatarUrl:   profiles[i]?.avatar_url ?? null,
      })),
    );
  }

  async addCollaborator(
    docId:  string,
    userId: string,
    role:   CollaboratorRole,
  ): Promise<void> {
    const invitedBy = this.auth.user()?.id;
    await this.supabase.from('document_collaborators').insert({
      document_id: docId,
      user_id:     userId,
      role,
      invited_by:  invitedBy,
    });
    await this.loadCollaborators(docId);
  }

  async updateRole(docId: string, userId: string, role: CollaboratorRole): Promise<void> {
    await this.supabase
      .from('document_collaborators')
      .update({ role })
      .eq('document_id', docId)
      .eq('user_id', userId);
    await this.loadCollaborators(docId);
  }

  async removeCollaborator(docId: string, userId: string): Promise<void> {
    await this.supabase
      .from('document_collaborators')
      .delete()
      .eq('document_id', docId)
      .eq('user_id', userId);
    await this.loadCollaborators(docId);
  }

  // ── Profile search ────────────────────────────────────────────────────────

  async searchProfiles(query: string): Promise<ProfileResult[]> {
    if (query.trim().length < 2) return [];
    const { data } = await this.supabase.rpc('search_profiles', { query: query.trim() });
    return (data ?? []) as ProfileResult[];
  }

  async getProfile(userId: string): Promise<ProfileResult | null> {
    const { data } = await this.supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', userId)
      .single();
    return data as ProfileResult | null;
  }

  // ── Realtime subscription ─────────────────────────────────────────────────

  /**
   * Subscribes to INSERT/DELETE events on document_collaborators for the given
   * document. Returns the channel so the caller can remove it on destroy.
   */
  subscribeToCollaboratorChanges(
    docId:    string,
    callback: () => void,
  ): RealtimeChannel {
    return this.supabase
      .channel(`collabs:${docId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'document_collaborators',
          filter: `document_id=eq.${docId}`,
        },
        callback,
      )
      .subscribe();
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideCollaborationService() {
  return { provide: CollaborationService, useClass: CollaborationService };
}
