import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';

export interface CollabUser {
  id: string;
  displayName: string;
}

export interface PresenceUser {
  id: string;
  displayName: string;
  color: string;
}

/** Deterministic hex color from a user-id string. */
function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

const PERSIST_INTERVAL_MS = 30_000;

/**
 * Custom Yjs provider that uses Supabase Realtime Broadcast as transport.
 *
 * Usage:
 *   const provider = new SupabaseYjsProvider(ydoc, docId, supabase, user);
 *   await provider.connect();
 *   // ... use provider.awareness in CodeMirror
 *   provider.destroy(); // on cleanup
 */
export class SupabaseYjsProvider {
  readonly awareness: Awareness;

  private channel: RealtimeChannel | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private presenceCallback: ((users: PresenceUser[]) => void) | null = null;

  constructor(
    private readonly ydoc: Y.Doc,
    private readonly docId: string,
    private readonly supabase: SupabaseClient,
    private readonly user: CollabUser,
  ) {
    this.awareness = new Awareness(ydoc);

    // Set local awareness state so peers can see this user.
    this.awareness.setLocalStateField('user', {
      id:          user.id,
      name:        user.displayName,
      color:       colorFromId(user.id),
    });
  }

  async connect(): Promise<void> {
    // ── 1. Load persisted Yjs state from Supabase ────────────────────────────
    const { data, error: fetchError } = await this.supabase
      .from('documents')
      .select('yjs_state')
      .eq('id', this.docId)
      .single();

    if (fetchError) {
      // Persisted state unavailable — starting from scratch.
    }

    if (data?.yjs_state) {
      try {
        Y.applyUpdate(this.ydoc, new Uint8Array(data.yjs_state as number[]));
      } catch {
        // Corrupt or incompatible state — starting fresh.
      }
    }

    // ── 2. Subscribe to Supabase Realtime channel and WAIT until ready ───────
    this.channel = this.supabase.channel(`yjs:${this.docId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    await new Promise<void>((resolve, reject) => {
      this.channel!
        .on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
          if (this.destroyed) return;
          Y.applyUpdate(this.ydoc, new Uint8Array(payload.update as number[]), this);
        })
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          if (this.destroyed) return;
          applyAwarenessUpdate(
            this.awareness,
            new Uint8Array(payload.update as number[]),
            this,
          );
          this.notifyPresence();
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            // Announce our awareness to peers immediately.
            this.broadcastAwareness([this.ydoc.clientID]);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Realtime channel failed: ${status}`));
          }
        });
    });

    // ── 3. Forward local Yjs updates to the channel ──────────────────────────
    // Attached AFTER subscription is confirmed so bootstrap inserts are broadcast.
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // Skip re-broadcasting updates that came from the channel itself.
      if (origin === this || this.destroyed || !this.channel) return;
      void this.channel.send({
        type:    'broadcast',
        event:   'yjs-update',
        payload: { update: Array.from(update) },
      });
    });

    // ── 4. Forward awareness changes to the channel ──────────────────────────
    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        if (this.destroyed) return;
        this.broadcastAwareness([...added, ...updated, ...removed]);
        this.notifyPresence();
      },
    );

    // ── 5. Periodic state persistence ────────────────────────────────────────
    this.saveTimer = setInterval(() => void this.persistState(), PERSIST_INTERVAL_MS);
  }

  /** Registers a callback fired whenever the connected-users list changes. */
  onPresenceChange(cb: (users: PresenceUser[]) => void): void {
    this.presenceCallback = cb;
  }

  /** Returns all users currently connected (including self). */
  getCurrentPresence(): PresenceUser[] {
    const users: PresenceUser[] = [];
    this.awareness.getStates().forEach((state) => {
      const u = state['user'];
      if (u) {
        users.push({ id: u.id, displayName: u.name, color: u.color });
      }
    });
    return users;
  }

  private notifyPresence(): void {
    if (this.presenceCallback && !this.destroyed) {
      this.presenceCallback(this.getCurrentPresence());
    }
  }

  /** Saves the full Yjs document state to Supabase. */
  async persistState(): Promise<void> {
    if (this.destroyed) return;
    const state = Y.encodeStateAsUpdate(this.ydoc);
    await this.supabase
      .from('documents')
      .update({ yjs_state: Array.from(state) })
      .eq('id', this.docId);
  }

  /** Signals user departure and cleans up the channel + timer. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.saveTimer !== null) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    // Signal to peers that this client has left.
    this.awareness.setLocalState(null);

    // Encode state synchronously NOW — before ngOnDestroy can call ydoc.destroy().
    // We cannot call this.persistState() here because the `destroyed` guard would
    // short-circuit it immediately. Encoding inline guarantees the bytes are
    // captured before the ydoc is torn down by the parent component.
    const state = Array.from(Y.encodeStateAsUpdate(this.ydoc));
    const cleanup = () => {
      if (this.channel) {
        void this.supabase.removeChannel(this.channel);
        this.channel = null;
      }
    };
    void this.supabase
      .from('documents')
      .update({ yjs_state: state })
      .eq('id', this.docId)
      .then(cleanup, cleanup);
  }

  private broadcastAwareness(clients: number[]): void {
    if (!this.channel) return;
    const update = encodeAwarenessUpdate(this.awareness, clients);
    void this.channel.send({
      type:    'broadcast',
      event:   'awareness',
      payload: { update: Array.from(update) },
    });
  }
}
