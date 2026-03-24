# Architecture Overview

## High-Level Diagram

```
Browser
├── Angular 21 SPA
│   ├── AppShell (document list)
│   ├── EditorPage
│   │   ├── CodeMirror 6 editor
│   │   ├── Typst preview (WASM renderer)
│   │   ├── AI Chat panel
│   │   ├── Files sidebar
│   │   └── Sharing panel
│   └── Login / Landing pages
│
├── Web Worker (compiler.worker.ts)
│   └── Typst WASM compiler (off main thread)
│
└── Supabase JS client
    ├── Auth (JWT sessions)
    ├── Database (PostgreSQL via REST)
    ├── Realtime (Broadcast for Yjs sync)
    └── Edge Functions (AI proxy)
```

---

## Route Map

| Path | Component | Guard |
|------|-----------|-------|
| `/` | `LandingPage` | none |
| `/login` | `LoginPage` | `guestGuard` (redirects authenticated users to `/app`) |
| `/app` | `AppLayout → AppShell` | `authGuard` |
| `/project/:id` | `EditorPage` | `authGuard` |
| `**` | redirect to `/` | — |

Both guards call `waitForAuth()` — a helper that waits for `AuthService.initialized` to be true before making any redirect decision, preventing false redirects on page reload.

---

## Key Architectural Decisions

### 1. Signals-first state management

All local and shared state uses Angular signals (`signal()`, `computed()`, `effect()`). RxJS is not used for application state — only the auth guard uses `toObservable()` as a bridge to the router's `CanActivateFn`.

Benefits:
- Fine-grained reactivity with zero-cost subscriptions
- `OnPush` change detection works automatically with signals
- No subscription management / memory leaks

### 2. Standalone components — no NgModules

Every component declares its dependencies in `imports: []` directly. No NgModules exist in the project. This results in cleaner tree-shaking and smaller bundles.

### 3. OnPush everywhere

All presentational components use `ChangeDetectionStrategy.OnPush`. The only manual `ChangeDetectorRef.markForCheck()` calls are in `ChatPanel`, where AI tokens stream outside Angular's zone for performance.

### 4. Web Worker for Typst compilation

The Typst WASM compiler is heavy (~28 MB). It runs exclusively inside a Web Worker so the main thread (UI) never blocks during compilation.

```
EditorPage
  └── CompilerService
        └── compiler.worker.ts (Worker)
              └── @myriaddreamin/typst-ts-web-compiler (WASM)
```

`CompilerService` implements a "latest-only" strategy — when a new compile request arrives, all in-flight requests are cancelled. Callers are responsible for debouncing (EditorPage uses an 80 ms debounce timer).

### 5. Optimistic updates for documents

`DocumentService` updates signals immediately on create/rename/delete, then persists to Supabase in the background. The UI never waits for the server to respond, but errors surface via `ToastService`.

### 6. AI traffic routed through Edge Function

```
ChatPanel → AiService → SupabaseProxyProvider → Supabase Edge Function → AI Provider API
```

API keys (Groq, OpenAI, Anthropic) are stored as Supabase secrets and never bundled into the client JavaScript. The Edge Function verifies the user's JWT before forwarding requests and enforces a DB-backed server-side rate limit.

### 7. Real-time collaboration via Yjs + Supabase Realtime

```
User A types → Y.Doc (CRDT) → SupabaseYjsProvider → Supabase Broadcast
                                                            ↓
User B receives ← Y.Doc (CRDT) ← SupabaseYjsProvider ← Supabase Broadcast
```

CodeMirror 6 is bound to the Yjs `Y.Text` via `y-codemirror.next`. The awareness protocol shows remote cursors and user presence.

---

## Data Flow: Document Editing (Solo Mode)

```
User types
  → EditorPanel (CodeMirror) emits contentChange
  → EditorPage.onContentChange()
    → saves draft to localStorage
    → starts 80ms debounce timer
  → timer fires → CompilerService.compile()
    → Web Worker compiles Typst → Uint8Array (vector)
  → vectorData signal updates
  → PreviewPanel re-renders
  → auto-save timer (30s) or Ctrl+S
    → DocumentService.saveContent() → Supabase
```

## Data Flow: Document Editing (Collaborative Mode)

```
User types
  → CodeMirror (bound to Y.Text via yCollab)
  → Y.Text CRDT update
    → SupabaseYjsProvider broadcasts update via Supabase Realtime
  → Remote peers receive broadcast → apply to their Y.Doc → their CodeMirror updates
  → Y.Text observer in EditorPage fires
    → content signal updates
    → 80ms debounce → CompilerService.compile() → vectorData updates
```

---

## Dependency Injection Tree

```
providedIn: 'root' (app-wide singletons)
├── SUPABASE (InjectionToken)
├── AuthService
├── DocumentService
├── ThemeService
├── ToastService
└── AiService (via provideAiService())
    └── AI_CONFIG (InjectionToken via provideAiConfig())

EditorPage providers: (page-scoped, destroyed with the page)
├── CompilerService
└── CollaborationService
```

---

## File Naming Conventions

| Type | Example |
|------|---------|
| Component | `editor-panel.ts` + `editor-panel.html` |
| Service | `document.service.ts` |
| Guard | `auth.guard.ts` |
| Interface/type | defined inline in the file that owns it |
| Worker | `compiler.worker.ts` |
| Provider factory | exported from the service file (`provideDocumentService()`) |
