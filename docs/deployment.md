# Deployment Guide

## Prerequisites

- Supabase project created at [supabase.com](https://supabase.com)
- Node.js 22+, npm 10+
- (Optional) Supabase CLI for managing secrets via terminal

---

## Step 1 — Database Migrations

Run each SQL file **in order** in the Supabase SQL editor (Dashboard → SQL Editor):

```
supabase/schema.sql                    ← core schema (run first)
supabase/collaboration_migration.sql   ← Yjs state column + collab support
supabase/ai_rate_limit_migration.sql   ← ai_requests table for rate limiting
supabase/seed.sql                      ← optional sample data
```

Verify each file runs without errors before moving to the next.

---

## Step 2 — Deploy the AI Edge Function

### Via the Supabase Dashboard

1. Go to **Edge Functions** in the Supabase dashboard.
2. Click **New Function**.
3. Name it exactly: `ai-chat`
4. Paste the contents of `supabase/functions/ai-chat/index.ts`.
5. Deploy.

### Via the Supabase CLI

```bash
# Link your project (run once)
npx supabase login
npx supabase link --project-ref <your-project-ref>

# Deploy the function
npx supabase functions deploy ai-chat
```

---

## Step 3 — Configure Supabase Secrets

API keys for AI providers **must** be stored as Supabase secrets — never in the Angular codebase.

### Via the Supabase Dashboard

Dashboard → **Edge Functions** → **Secrets** → Add:

| Secret name | Value | Required for |
|-------------|-------|-------------|
| `GROQ_API_KEY` | `gsk_...` | Llama models via Groq |
| `OPENAI_API_KEY` | `sk-...` | GPT-4o / GPT-4o Mini |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude Sonnet / Haiku |

You only need to add the key for the provider you're actually using.

### Via the Supabase CLI

```bash
npx supabase secrets set GROQ_API_KEY=gsk_your_key_here
npx supabase secrets set OPENAI_API_KEY=sk_your_key_here
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-your_key_here
```

---

## Step 4 — Configure the Angular Environment

### Development (`src/environments/environment.ts`)

```ts
export const environment = {
  production:  false,
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-anon-public-key',
};
```

### Production (`src/environments/environment.prod.ts`)

Inject values at build time via your CI/CD pipeline:

```bash
# Example with GitHub Actions / any CI
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_KEY="your-anon-key"

# Substitute values before build
sed -i "s|supabaseUrl: ''|supabaseUrl: '$SUPABASE_URL'|g" src/environments/environment.prod.ts
sed -i "s|supabaseKey: ''|supabaseKey: '$SUPABASE_KEY'|g" src/environments/environment.prod.ts

npm run build
```

> The anon/publishable key is safe to include in the bundle. It only grants access that RLS allows. **Never include secret/service role keys in the frontend.**

---

## Step 5 — Build & Deploy the Angular App

```bash
npm run build
```

Output goes to `dist/Typs-Clone/browser/`. Deploy to any static host:

| Platform | Command / Config |
|----------|-----------------|
| Vercel | Connect repo → `npm run build` → output dir `dist/Typs-Clone/browser` |
| Netlify | Build command `npm run build` → publish dir `dist/Typs-Clone/browser` |
| Supabase Storage | `npx supabase storage cp -r dist/Typs-Clone/browser/* s3://your-bucket/` |
| AWS S3 + CloudFront | Upload `dist/` contents, configure CloudFront for SPA routing |

**Important:** Configure your host for **SPA routing** — all unknown paths must serve `index.html`.

- Vercel: automatic
- Netlify: add `_redirects` file with `/* /index.html 200`
- Apache: configure `.htaccess` RewriteRule

---

## Supabase Realtime Configuration

Ensure Realtime is enabled for the following tables in Supabase Dashboard → **Realtime**:

- `document_collaborators` (for presence and collab activation)

The Yjs sync uses the **Broadcast** channel (not table subscriptions) so no additional Realtime config is needed for editing.

---

## Environment Checklist

Before going live:

- [ ] `schema.sql` + all migrations applied
- [ ] Edge Function `ai-chat` deployed
- [ ] At least one AI provider secret set (`GROQ_API_KEY`, etc.)
- [ ] `environment.prod.ts` has correct `supabaseUrl` and `supabaseKey`
- [ ] WASM files present in `public/assets/` (`.wasm` files committed to repo)
- [ ] Fonts downloaded (`npm run fonts:download`) and committed
- [ ] SPA routing configured on host
- [ ] Supabase Realtime enabled for `document_collaborators`
- [ ] Supabase auth email templates configured (optional)
- [ ] RLS policies verified in Supabase dashboard

---

## Switching the Active AI Model

To change which model the app uses, edit `app.config.ts`:

```ts
provideAiConfig('claude-sonnet-4-6', {
  proxyUrl: `${environment.supabaseUrl}/functions/v1/ai-chat`,
}),
```

Replace the model ID with any ID from `AI_MODELS` in `ai-model-registry.ts`. Make sure the corresponding `*_API_KEY` secret is set in Supabase.

---

## Adding a New AI Provider

1. Add a model entry to `AI_MODELS` in `ai-model-registry.ts`.
2. Add its config to `MODEL_CONFIGS` in `supabase/functions/ai-chat/index.ts`.
3. Re-deploy the Edge Function.
4. Add the secret key to Supabase.

No Angular build or deploy needed — only the Edge Function changes.
