# Folia — Claude Code Project Guide

## What this project is
A collaborative Typst document editor — a product-level clone of [typst.app](https://typst.app) built with Angular 21. Users write Typst markup, see a live canvas-rendered preview, organize documents, and eventually collaborate in real time. A key differentiator is an integrated AI assistant (Claude API) that takes user research and inserts it as formatted Typst content.

## Stack
| Layer | Technology |
|-------|-----------|
| Framework | Angular 21 — standalone components, no NgModules |
| Styling | TailwindCSS 4 |
| Typst compile | `@myriaddreamin/typst-ts-web-compiler` via Web Worker |
| Typst render | `@myriaddreamin/typst.angular` |
| Icons | `lucide-angular` |
| Testing | Vitest (`ng test`) |
| AI | Claude API (Anthropic) — not yet wired |

## Development commands
```bash
npm start          # ng serve (dev server)
npm run build      # ng build
npm test           # ng test (Vitest)
```

## File structure
```
src/app/
  app.ts / app.html         — root component; composes Sidebar + Header + Shell
  app.routes.ts             — router config (currently minimal)
  app.config.ts             — bootstrapApplication providers

  layout/app/
    app-sidebar/            — collapsible nav rail (signal isCollapsed)
    app-header/             — sticky top bar with user avatar
    app-shell/              — documents-list home page (search, sort, "Crear Documento")

  core/service/
    compiler/compiler-service.ts  — Angular service wrapping compile worker; cancel-in-flight strategy
    theme/theme-service.ts        — dark/light theme service

  shared/components/
    button/                 — primary/secondary Button component
    dropdown/               — generic Dropdown + DropdownItem
    text-field/             — TextField with two-way signal binding
    avatar/                 — user Avatar component
    spinner/                — loading Spinner
    document-list/          — DocumentList card grid; emits open/rename/delete

  workers/
    compiler.worker.ts      — WASM Typst compiler (content → vectorData Uint8Array)

public/assets/
  typst_ts_web_compiler_bg.wasm
  typst_ts_renderer_bg.wasm
```

## Key architectural patterns
- **Signals everywhere** — prefer `signal()` / `computed()` / `linkedSignal()` over RxJS for local state.
- **OnPush** on all presentational components (`DocumentList`, shared components).
- **Standalone components only** — no NgModules; import directly in `imports: []`.
- **Web Worker for Typst** — compile runs off the main thread via `CompilerService`; only the latest compile result is kept (cancel-all-in-flight).

## Current state (2026-03-13)
- Layout fully wired: sidebar + header + shell visible and functional.
- `AppShell` shows a hard-coded `documents[]` array (no persistence layer yet).
- No editor/render component exists — `src/app/features/` does not exist yet.
- `CompilerService` is functional but nothing calls it (no editor yet).
- UI language is a mix of Spanish and English — sort labels are Spanish; card menu is English.

## What still needs to be built
1. **Editor view** — `src/app/features/editor/` with split-pane (CodeMirror + Typst canvas).
2. **Render pipeline** — render-worker service feeding compiled vector data to `<typst-document>`.
3. **Routing** — `/` → documents list, `/doc/:id` → editor view.
4. **Persistence layer** — local storage or backend API for `documents[]`.
5. **AI assistant panel** — Claude API integration inside the editor.
6. **Real-time collaboration** — backend TBD.

## Coding conventions
- Single-responsibility components with `templateUrl` + optional `styleUrl`.
- Guard `protected` on template-only methods/properties; `readonly` on icon refs and static data.
- No `any`; prefer explicit TypeScript types.
- Prettier config in `package.json` (`printWidth: 100`, `singleQuote: true`).
