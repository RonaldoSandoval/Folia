# Database — Supabase Schema

## Tables

### `profiles`

Extends `auth.users`. Created automatically by the `handle_new_user()` trigger on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | FK → `auth.users(id)` CASCADE |
| `username` | text UNIQUE | optional handle |
| `full_name` | text | shown in presence + header |
| `avatar_url` | text | profile picture URL |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-updated by trigger |

---

### `folders`

Hierarchical folder structure. Supports unlimited nesting via self-referencing `parent_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `owner_id` | uuid | FK → `profiles(id)` CASCADE |
| `parent_id` | uuid NULL | FK → `folders(id)` CASCADE — null means root |
| `name` | text | folder display name |
| `created_at` / `updated_at` | timestamptz | |

---

### `documents`

Core document store. Content is stored as raw Typst text. Multi-file projects store all files as a JSONB array.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `owner_id` | uuid | FK → `profiles(id)` CASCADE |
| `folder_id` | uuid NULL | FK → `folders(id)` SET NULL on folder delete |
| `title` | text | display name |
| `content` | text | content of `active_file` (kept in sync) |
| `files` | jsonb | `ProjectFile[]` — all source files in the project |
| `active_file` | text | filename of the currently open file |
| `thumbnail_url` | text | preview image (not yet generated) |
| `is_public` | boolean | public sharing flag (not yet wired) |
| `created_at` / `updated_at` | timestamptz | |

**`ProjectFile` shape (inside `files` jsonb array):**
```json
{ "name": "main.typ", "content": "= Hello", "isFolder": false }
```

---

### `document_collaborators`

Junction table linking users to documents they have access to.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `document_id` | uuid | FK → `documents(id)` CASCADE |
| `user_id` | uuid | FK → `profiles(id)` CASCADE |
| `role` | `collaborator_role` | `viewer`, `editor`, or `admin` |
| `invited_by` | uuid NULL | FK → `profiles(id)` SET NULL |
| `created_at` | timestamptz | |

**Unique constraint:** `(document_id, user_id)` — one role per user per document.

**Role permissions:**

| Role | Read | Write | Invite others |
|------|------|-------|---------------|
| `viewer` | ✓ | — | — |
| `editor` | ✓ | ✓ | — |
| `admin` | ✓ | ✓ | ✓ |
| owner (no row) | ✓ | ✓ | ✓ |

---

### `document_versions`

Snapshot history for a document. Version numbers auto-increment per document.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `document_id` | uuid | FK → `documents(id)` CASCADE |
| `created_by` | uuid NULL | FK → `profiles(id)` SET NULL |
| `content` | text | full Typst source at this version |
| `version_number` | integer | auto-incremented per document |
| `label` | text NULL | optional tag (e.g. "v1.0", "before refactor") |
| `created_at` | timestamptz | |

**Unique:** `(document_id, version_number)`.

---

### `ai_requests`

Used for server-side AI rate limiting. Written by the Edge Function using the service role key (bypasses RLS).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK → `auth.users(id)` CASCADE |
| `model_id` | text | e.g. `llama-3.3-70b-versatile` |
| `created_at` | timestamptz | default `NOW()` |

Index: `(user_id, created_at DESC)` for fast sliding-window queries.

---

## Triggers & Functions

| Name | Fires on | Action |
|------|----------|--------|
| `handle_updated_at()` | BEFORE UPDATE on all tables | sets `updated_at = NOW()` |
| `handle_new_user()` | AFTER INSERT on `auth.users` | creates a `profiles` row |
| `set_version_number()` | BEFORE INSERT on `document_versions` | increments `version_number` per document |

---

## Row Level Security (RLS)

RLS is enabled on all tables. Key policies:

- **documents**: owner can do everything; collaborators can SELECT (all) and UPDATE (editors/admins only).
- **folders**: owner-only access.
- **document_collaborators**: owner can INSERT/DELETE; collaborators can SELECT their own rows.
- **ai_requests**: no direct client access — all writes go through the Edge Function with service role key.

---

## Realtime Subscriptions

The app uses two Supabase Realtime channels:

| Channel | Table | Event | Used by |
|---------|-------|-------|---------|
| `shared-docs-watcher` | `document_collaborators` | INSERT | `DocumentService` refreshes document list when a document is shared with the current user |
| `doc-collab-{id}` | `document_collaborators` | INSERT/DELETE | `EditorPage` activates/deactivates Yjs when collaborators are added or removed |

Yjs sync uses **Broadcast** (not database changes) — raw Yjs update bytes are broadcast peer-to-peer via Supabase Realtime.

---

## Running Migrations

Execute files in this order in the Supabase SQL Editor:

```
1. supabase/schema.sql
2. supabase/collaboration_migration.sql
3. supabase/ai_rate_limit_migration.sql
4. supabase/seed.sql   (optional — adds sample data)
```
