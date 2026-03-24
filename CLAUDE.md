# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is
A collaborative Typst document editor — a product-level clone of [typst.app](https://typst.app) built with Angular 21. Users write Typst markup, see a live canvas-rendered preview, organize documents in folders, and collaborate in real time. An integrated AI assistant generates formatted Typst content using a pluggable provider system.

## Stack
| Layer | Technology |
|-------|-----------|
| Framework | Angular 21 — standalone components, no NgModules |
| Styling | TailwindCSS 4 |
| Typst compile | `@myriaddreamin/typst-ts-web-compiler` via Web Worker |
| Typst render | `@myriaddreamin/typst.ts` (global renderer) |
| Editor | CodeMirror 6 |
| Real-time collaboration | Yjs + Supabase Realtime Broadcast |
| Auth + DB | Supabase (auth, `documents`, `folders`, `document_collaborators` tables) |
| AI | Groq `llama-3.3-70b-versatile` (active); provider-agnostic — also supports OpenAI, Anthropic, Ollama |
| Icons | `lucide-angular` |
| Testing | Vitest (`ng test`) |

## Development commands
```bash
npm start          # ng serve (dev server)
npm run build      # ng build
npm test           # ng test (Vitest)
```

To run a single test file:
```bash
npx vitest run src/path/to/file.spec.ts
```

## Key architectural patterns

- **Signals everywhere** — prefer `signal()` / `computed()` / `linkedSignal()` over RxJS for local state.
- **OnPush** on all presentational components.
- **Standalone components only** — no NgModules; import directly in `imports: []`.
- **Service provider factories** — every injectable service exports a `provideXxxService()` factory function called in `app.config.ts`. Never add services to `@Injectable({ providedIn: 'root' })`.
- **Web Worker for Typst** — compile runs off the main thread via `CompilerService`; only the latest result is kept (cancel-in-flight strategy).

## Routes

| Path | Component | Guard |
|------|-----------|-------|
| `/` | `LandingPage` | — |
| `/login` | `LoginPage` | `guestGuard` |
| `/app` | `AppLayout` → `AppShell` | `authGuard` |
| `/project/:id` | `EditorPage` (lazy) | `authGuard` |

`ParamAwareReuseStrategy` (in `app.config.ts`) prevents Angular from reusing `EditorPage` when navigating between different `:id` params — this is critical for correct `ngOnInit`/`ngOnDestroy` lifecycle.

## Editor architecture (`src/app/features/editor/`)

`EditorPage` is the orchestrator. It owns all state and coordinates:
- `EditorPanel` — CodeMirror 6 editor
- `PreviewPanel` — Typst canvas renderer
- `ChatPanel` — AI assistant (streaming responses)
- `FilesSidebar` — file/folder tree
- `SharingPanel` — collaborator management
- `EditorHeader` — title, save status, download (PDF/SVG/PNG)

### Solo mode vs. collaborative mode

The editor switches between two modes depending on whether collaborators exist:

- **Solo mode**: content stored in Supabase + localStorage draft (`typs_draft_${documentId}`). The draft protects against tab-close data loss between the 2 s auto-save debounce window.
- **Collaborative mode**: Yjs (`Y.Doc`) drives content via `SupabaseYjsProvider`. localStorage draft is disabled. Yjs state is persisted to Supabase both on explicit save (Ctrl+S) and on `ngOnDestroy`.

Mode switches dynamically: adding the first collaborator activates Yjs; removing the last deactivates it.

### Compile pipeline

Compile is debounced 80 ms (`COMPILE_DEBOUNCE_MS`). Auto-save is debounced 2 s. Both timers are cleared in `ngOnDestroy`.

### File-tree mutations

Always call `flushIfUnsaved()` before any file-tree mutation (`addFile`, `deleteFile`, `renameFile`, folder operations). Without this, the stale `files` array in the Supabase cache would be written, erasing unsaved content.

## AI service (`src/app/core/service/ai/`)

`AiService` is the single AI entry point for the rest of the app. It streams tokens via `chat()` as an `AsyncIterable<string>`.

**Provider selection** (set once in `app.config.ts` via `provideAiConfig()`):
- Production: all traffic goes through a Supabase Edge Function (`/functions/v1/ai-chat`). API keys are Supabase secrets — they never reach the browser.
- Dev: direct API call using the key from `environment.ts`.

**To switch the active model**: change the first argument to `provideAiConfig()` in `app.config.ts` to any id from `AI_MODELS` in `ai-model-registry.ts`.

**Rate limiting**: 10 requests/minute client-side (`RateLimiter`). The Edge Function enforces the real server-side limit. Both surface as `RateLimitError`.

**Inline AI (Ctrl+K)**: handled by `onAiInlineCommand()` in `EditorPage`. The full response is buffered, fences stripped via `stripInlineCodeFences()`, then inserted at cursor.

## Document service (`src/app/core/service/document/document.service.ts`)

- Paginated reads: 20 documents per page; `loadMoreDocuments()` appends.
- All mutations are optimistic with rollback on Supabase error.
- Subscribes to `document_collaborators` INSERT events to refresh the list when someone shares a document with the current user.
- `Document` extends `DocumentItem` so `DocumentList` works without any type adapter.

## Coding conventions
- `protected` on template-only methods/properties; `readonly` on icon refs and static data.
- No `any`; prefer explicit TypeScript types.
- Prettier config in `package.json` (`printWidth: 100`, `singleQuote: true`).
