# Folia — Collaborative Typst Editor

A collaborative document editor for [Typst](https://typst.app), built with Angular 21 and Supabase. Write Typst markup, see a live rendered preview, collaborate in real time with other users, and use an integrated AI assistant to generate formatted Typst content.

---

## Quick Start

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 22 |
| npm | 10 |
| Supabase account | — |
| Groq API key (or OpenAI / Anthropic) | — |

### 1. Clone & install

```bash
git clone <repo-url>
cd Folia
npm install
```

### 2. Configure environment

Edit `src/environments/environment.ts` with your Supabase project credentials:

```ts
export const environment = {
  production: false,
  supabaseUrl:  'https://<your-project>.supabase.co',
  supabaseKey:  '<your-anon-public-key>',
};
```

> **Never add AI API keys to this file.** They are stored as Supabase secrets and accessed only from the Edge Function. See [docs/deployment.md](docs/deployment.md).

### 3. Set up the database

Run each SQL file in the Supabase SQL editor **in this order**:

```
supabase/schema.sql                    ← tables, triggers, RLS
supabase/collaboration_migration.sql   ← real-time collab support
supabase/ai_rate_limit_migration.sql   ← server-side AI rate limiting
supabase/seed.sql                      ← (optional) sample data
```

### 4. Deploy the AI Edge Function

In the Supabase dashboard → **Edge Functions** → **New function** → name it `ai-chat` → paste the contents of `supabase/functions/ai-chat/index.ts`.

Then add your AI provider key as a secret (Dashboard → Edge Functions → Secrets):

```
GROQ_API_KEY=gsk_...
```

For other providers add: `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`.

### 5. Download fonts

```bash
npm run fonts:download
```

### 6. Start the dev server

```bash
npm start
# Open http://localhost:4200
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server with HMR on port 4200 |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest test suite |
| `npm run fonts:download` | Download font files to `public/assets/fonts/` |

---

## Project Structure

```
Folia/
├── README.md
├── src/
│   ├── app/
│   │   ├── app.ts / app.html / app.routes.ts / app.config.ts
│   │   ├── core/
│   │   │   ├── guards/               authGuard, guestGuard
│   │   │   └── service/
│   │   │       ├── ai/               AiService + providers + rate limiter
│   │   │       ├── auth/             AuthService (Supabase auth)
│   │   │       ├── collaboration/    Yjs + Supabase Realtime
│   │   │       ├── compiler/         CompilerService (Web Worker bridge)
│   │   │       ├── document/         DocumentService (CRUD + folders)
│   │   │       ├── supabase/         SUPABASE InjectionToken
│   │   │       ├── theme/            ThemeService (dark/light)
│   │   │       └── toast/            ToastService (notifications)
│   │   ├── features/
│   │   │   ├── auth/login/           Login + signup page
│   │   │   └── editor/               Full editor page + panels
│   │   ├── layout/app/               Sidebar, header, document shell
│   │   └── shared/components/        Button, Modal, Spinner, Toast, etc.
│   ├── environments/                 Dev / prod config (no secrets)
│   └── workers/
│       └── compiler.worker.ts        Typst WASM compiler (off main thread)
├── supabase/
│   ├── schema.sql
│   ├── collaboration_migration.sql
│   ├── ai_rate_limit_migration.sql
│   ├── seed.sql
│   └── functions/ai-chat/index.ts   Edge Function (AI proxy)
├── public/assets/
│   ├── typst_ts_web_compiler_bg.wasm
│   ├── typst_ts_renderer_bg.wasm
│   └── fonts/
└── docs/                             Full project documentation
```

---

## Documentation

| Document | What it covers |
|----------|---------------|
| [docs/architecture.md](docs/architecture.md) | System design, data flow, key patterns |
| [docs/database.md](docs/database.md) | Supabase schema, RLS, triggers, functions |
| [docs/ai-system.md](docs/ai-system.md) | AI architecture, providers, Edge Function, streaming |
| [docs/collaboration.md](docs/collaboration.md) | Real-time editing with Yjs + Supabase Realtime |
| [docs/design-system.md](docs/design-system.md) | CSS design tokens, theming, component conventions |
| [docs/services.md](docs/services.md) | All Angular services — responsibilities, API, DI |
| [docs/deployment.md](docs/deployment.md) | Production deployment checklist |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Angular 21 — standalone components, signals, OnPush |
| Styling | TailwindCSS 4 — semantic design tokens |
| Code editor | CodeMirror 6 |
| Typst compiler | `@myriaddreamin/typst-ts-web-compiler` (WASM, Web Worker) |
| Typst renderer | `@myriaddreamin/typst.angular` |
| Icons | `lucide-angular` |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Real-time collab | Yjs CRDT + `y-codemirror.next` + Supabase Realtime Broadcast |
| AI | Groq / OpenAI / Anthropic — proxied via Supabase Edge Function |
| Testing | Vitest |
