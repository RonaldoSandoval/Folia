# Real-Time Collaboration

## Overview

Collaborative editing is powered by **Yjs** (a CRDT library) and **Supabase Realtime Broadcast**. When a document has at least one collaborator, the editor switches from "solo mode" to "collaborative mode" automatically.

---

## Modes

### Solo Mode

- Content saved in `localStorage` as a draft on every keystroke.
- Auto-save to Supabase every 30 seconds (or Ctrl+S).
- No Yjs involved.

### Collaborative Mode

Activated when:
- The current user is NOT the document owner (they are a collaborator), **or**
- The document has at least one collaborator (even if the current user is the owner).

In this mode:
- `localStorage` draft is cleared and disabled.
- A `Y.Doc` is created with a `Y.Text` named `"content"`.
- `SupabaseYjsProvider` connects the Y.Doc to Supabase Realtime.
- CodeMirror is bound to the Y.Text via `yCollab` (y-codemirror.next).
- Changes propagate in real time to all connected peers.

---

## Architecture

```
User A (EditorPage)
  Y.Doc
    └── Y.Text ("content")
          └── yCollab binding → CodeMirror 6
  SupabaseYjsProvider
    ├── connect() → subscribes to Supabase Realtime channel "doc-{id}"
    ├── on Y.Doc update → broadcasts encoded update bytes
    └── on broadcast "yjs-update" → applies to Y.Doc
```

---

## SupabaseYjsProvider

**File:** `src/app/core/service/collaboration/supabase-yjs-provider.ts`

### Key methods

| Method | Description |
|--------|-------------|
| `connect()` | Joins the Realtime channel, loads persisted Yjs state from DB |
| `disconnect()` | Leaves the channel |
| `destroy()` | Disconnects + cleans up awareness |
| `persistState()` | Serializes Y.Doc and saves to `documents.yjs_state` in Supabase |
| `onPresenceChange(cb)` | Register callback for when connected users change |
| `getCurrentPresence()` | Returns current `PresenceUser[]` snapshot |

### Persistence

When `persistState()` is called (on manual Ctrl+S in collab mode), the full Y.Doc state is serialized with `Y.encodeStateAsUpdate()` and saved to the `documents` table as a JSONB column. On load, it is restored with `Y.applyUpdate()`.

> **Important:** The `yjs_state` column must be `jsonb` (not `bytea`). If you have an older schema, run:
> ```sql
> ALTER TABLE documents DROP COLUMN yjs_state;
> ALTER TABLE documents ADD COLUMN yjs_state jsonb;
> ```

---

## Presence (Who Is Editing)

User presence is handled via the **Yjs Awareness protocol**.

When a user connects, their profile info is written to awareness:
```ts
provider.awareness.setLocalStateField('user', {
  id:          user.id,
  displayName: profile.full_name ?? user.email,
  color:       '#...' // deterministic from user ID
});
```

The `EditorPage` listens for awareness changes and updates `presenceUsers` signal, which `EditorHeader` displays as an avatar stack.

**`PresenceUser` type:**
```ts
interface PresenceUser {
  id:          string;
  displayName: string;
  color:       string;
}
```

---

## Collaborative Mode Lifecycle

### Activation (first collaborator added)

1. Owner invites user via `SharingPanel`.
2. `CollaborationService.addCollaborator()` inserts row into `document_collaborators`.
3. Supabase Realtime fires INSERT event on `doc-collab-{id}` channel.
4. `EditorPage.watchCollaboratorChanges()` receives the event, reloads collaborators.
5. `isCollab` is now true → `initYjs(currentContent)` is called.
6. Y.Doc bootstrapped from current content, Yjs mode activated.

### Deactivation (last collaborator removed)

1. Owner removes last collaborator.
2. Same flow, but `isCollab` is now false.
3. `deactivateYjs()` is called:
   - Yjs provider destroyed.
   - `yjsBinding` set to null (CodeMirror switches to solo mode).
   - Content synced back to `documents.content` via `saveContent()`.

---

## Roles & Permissions

| Role | Can read | Can write | Can invite |
|------|----------|-----------|-----------|
| `owner` | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ |
| `editor` | ✓ | ✓ | — |
| `viewer` | ✓ | — | — |

The `viewer` role is enforced by setting CodeMirror to `readonly: true` via `EditorPanel`'s `readonly` input.

---

## CollaborationService

**File:** `src/app/core/service/collaboration/collaboration.service.ts`

| Method | Description |
|--------|-------------|
| `loadRole(docId)` | Returns `'owner'` or a `CollaboratorRole` for the current user |
| `loadCollaborators(docId)` | Fetches collaborator list with profiles, populates signal |
| `addCollaborator(docId, userId, role)` | Inserts into `document_collaborators` |
| `updateRole(docId, userId, role)` | Updates role for a collaborator |
| `removeCollaborator(docId, userId)` | Deletes from `document_collaborators` |
| `searchProfiles(query)` | Full-text search on `profiles.full_name` / `username` / `email` |
| `getProfile(userId)` | Fetch a single profile |
| `subscribeToCollaboratorChanges(docId, cb)` | Realtime subscription for INSERT/DELETE on collaborators |

---

## Known Limitations

- Yjs state is persisted only on explicit save (Ctrl+S / save button in collab mode). If a user closes the tab without saving, changes in Y.Doc are not persisted to the DB (but they ARE propagated to other connected peers in real time).
- The `awareness` / presence info is lost on disconnect (ephemeral by design).
- Multi-file collab: only the `active_file` content is in Y.Text. Switching files in collab mode replaces the Y.Text content — this can cause brief desync between peers if they have different active files.
