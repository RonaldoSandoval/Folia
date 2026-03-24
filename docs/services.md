# Services Reference

All services follow the provider-factory pattern: each service file exports both the class and a `provide*()` factory function used in `app.config.ts`.

---

## AuthService

**File:** `src/app/core/service/auth/auth.service.ts`
**Scope:** `providedIn: 'root'` via `provideAuthService()`

Manages Supabase authentication. Signals stay in sync with Supabase auth events across tabs.

### Public API

| Member | Type | Description |
|--------|------|-------------|
| `user` | `Signal<User \| null>` | Current Supabase user (null if logged out) |
| `loading` | `Signal<boolean>` | True during sign-in / sign-up |
| `error` | `Signal<string \| null>` | Latest auth error message |
| `initialized` | `Signal<boolean>` | True once `getSession()` has resolved (guards wait for this) |
| `isAuthenticated` | `Signal<boolean>` | Computed: `user() !== null` |
| `signIn(email, password)` | `Promise<void>` | Email/password login → navigates to `/app` |
| `signUp(email, password)` | `Promise<void>` | Registration |
| `signOut()` | `Promise<void>` | Clears session → navigates to `/login` |
| `clearError()` | `void` | Resets the error signal |

---

## DocumentService

**File:** `src/app/core/service/document/document.service.ts`
**Scope:** `providedIn: 'root'` via `provideDocumentService()`

Single source of truth for all documents and folders. All mutations are **optimistic** — signals update immediately, Supabase persists in the background.

### Public signals

| Signal | Type | Description |
|--------|------|-------------|
| `documents` | `Signal<DocumentItem[]>` | Computed document list (summaries for the shell UI) |
| `folders` | `Signal<FolderItem[]>` | All folders owned by the current user |
| `isLoading` | `Signal<boolean>` | True during initial `loadAll()` |

### Document CRUD

| Method | Description |
|--------|-------------|
| `getById(id)` | Synchronous cache lookup |
| `fetchById(id)` | Async fetch + cache — used when opening a doc directly via URL |
| `create(title?, folderId?)` | Creates doc, navigates to `/project/:id` |
| `saveContent(id, content)` | Saves active file content → returns `{ error }` |
| `rename(id, title)` | Renames document |
| `delete(id)` | Deletes document |
| `moveDocument(docId, folderId)` | Moves document to a different folder |

### Folder CRUD

| Method | Description |
|--------|-------------|
| `createFolder(name, parentId?)` | Creates a workspace folder |
| `renameFolder(id, name)` | Renames a folder |
| `deleteFolder(id)` | Deletes folder + all documents inside (recursive) |

### Multi-file (project files)

| Method | Description |
|--------|-------------|
| `addFile(docId, name)` | Adds a new `.typ` file to the project |
| `renameFile(docId, oldName, newName)` | Renames a project file |
| `deleteFile(docId, fileName)` | Deletes file; falls back to first remaining file |
| `switchFile(docId, fileName)` | Sets `active_file` and syncs `content` |
| `addProjectFolder(docId, folderName)` | Adds a folder entry to the file list |
| `renameProjectFolder(docId, old, new)` | Renames folder + updates all file paths inside it |
| `deleteProjectFolder(docId, name)` | Deletes folder + its files from the project |

---

## CompilerService

**File:** `src/app/core/service/compiler/compiler-service.ts`
**Scope:** Provided at `EditorPage` level (scoped — destroyed with the page)

Bridges `EditorPage` to the Typst compiler running in a Web Worker.

| Method | Description |
|--------|-------------|
| `compile(content, sources[])` | Compiles Typst → `Promise<Uint8Array>` (vector data). Cancels in-flight requests. |
| `exportPdf()` | Re-compiles as PDF → `Promise<Uint8Array>` |
| `addFile(path, data)` | Registers a binary asset (image) in the worker's virtual filesystem |
| `removeFile(path)` | Unregisters an asset |

**Cancel strategy:** Every call to `compile()` cancels all pending requests before posting the new one. Only the latest result is used.

---

## CollaborationService

**File:** `src/app/core/service/collaboration/collaboration.service.ts`
**Scope:** Provided at `EditorPage` level via `provideCollaborationService()`

| Method | Description |
|--------|-------------|
| `collaborators` | `Signal<Collaborator[]>` — current document's collaborator list |
| `loadRole(docId)` | Returns `'owner'` or a `CollaboratorRole` for the current user |
| `loadCollaborators(docId)` | Fetches collaborators with profile info, populates signal |
| `addCollaborator(docId, userId, role)` | Invite a user to the document |
| `updateRole(docId, userId, role)` | Change a collaborator's role |
| `removeCollaborator(docId, userId)` | Remove a collaborator |
| `searchProfiles(query)` | Search users by name / email (for invite autocomplete) |
| `getProfile(userId)` | Fetch one user's profile |
| `subscribeToCollaboratorChanges(docId, cb)` | Realtime listener for collaborator INSERT/DELETE |

---

## AiService

**File:** `src/app/core/service/ai/ai.service.ts`
**Scope:** `providedIn: 'root'` via `provideAiService()` + `provideAiConfig()`

| Member | Type | Description |
|--------|------|-------------|
| `activeModel` | `AiModelDef` | Currently configured model |
| `availableModels` | `AiModelDef[]` | Full model catalog |
| `requestsRemaining` | `number` | Remaining slots in the client-side window |
| `chat(messages)` | `AsyncIterable<string>` | Streams tokens; throws `RateLimitError` when limit hit |

Configure in `app.config.ts`:
```ts
provideAiConfig('llama-3.3-70b-versatile', {
  proxyUrl: `${environment.supabaseUrl}/functions/v1/ai-chat`,
}),
provideAiService(),
```

---

## ThemeService

**File:** `src/app/core/service/theme/theme-service.ts`
**Scope:** `providedIn: 'root'`

| Member | Description |
|--------|-------------|
| `isDark` | `Signal<boolean>` |
| `toggle()` | Flips dark/light, persists to `localStorage` |

---

## ToastService

**File:** `src/app/core/service/toast/toast.service.ts`
**Scope:** `providedIn: 'root'`

| Method | Default duration | Color |
|--------|-----------------|-------|
| `success(msg, ms?)` | 3 000 ms | Green |
| `error(msg, ms?)` | 5 000 ms | Red |
| `warning(msg, ms?)` | 4 000 ms | Amber |
| `info(msg, ms?)` | 3 000 ms | Brand |
| `dismiss(id)` | — | — |

`toasts` signal is consumed by `ToastContainer` (rendered in `app.html`).

---

## SUPABASE InjectionToken

**File:** `src/app/core/service/supabase/supabase.client.ts`

```ts
const SUPABASE = new InjectionToken<SupabaseClient>('SupabaseClient', {
  providedIn: 'root',
  factory: () => createClient(environment.supabaseUrl, environment.supabaseKey),
});
```

Inject anywhere: `private readonly supabase = inject(SUPABASE)`.
