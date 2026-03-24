# AI System

## Overview

The AI assistant lets users describe what they want written and generates valid Typst markup. Responses stream token-by-token. Human-readable explanations are shown in the chat; raw Typst code is revealed in a preview block and only inserted into the editor when the user clicks **Insertar en editor**.

---

## Architecture

```
ChatPanel (UI)
  │
  ├── sends user message + history
  ▼
AiService
  ├── checks client-side rate limiter (10 req / 60s — UX feedback only)
  └── delegates to resolved AiProvider
        │
        ▼
SupabaseProxyProvider           ← production (default)
  │  - attaches user JWT
  │  - POSTs to Edge Function
  ▼
Supabase Edge Function (ai-chat)
  ├── verifies JWT
  ├── checks server-side rate limit (DB: ai_requests table)
  ├── reads API key from Supabase secrets
  └── forwards to upstream AI provider (Groq / OpenAI / Anthropic)
        │
        ▼ SSE stream (token by token)
        passes through Edge Function → SupabaseProxyProvider → AiService → ChatPanel
```

---

## Provider Chain

`AiService.resolveProvider()` inspects `AiConfig`:

| Condition | Provider used |
|-----------|--------------|
| `config.proxyUrl` is set | `SupabaseProxyProvider` (production) |
| `config.apiKey` is set, no proxyUrl | `OpenAiCompatProvider` or `AnthropicProvider` (local dev / Ollama) |

The proxy is always used in the deployed app. Direct providers are only for local experimentation (e.g. Ollama, which has no API key).

---

## Model Registry

All available models are declared in `ai-model-registry.ts`. To add a new model, add one entry to `AI_MODELS`:

```ts
{
  id:           'your-model-id',   // sent to the API
  label:        'Display Name',    // shown in UI (future model selector)
  providerType: 'openai-compat',   // or 'anthropic'
  baseUrl:      'https://...',
  maxTokens:    8192,
  description:  'Short description for selector tooltip.',
}
```

To switch the active model, change the first argument to `provideAiConfig()` in `app.config.ts`:

```ts
provideAiConfig('claude-sonnet-4-6', {
  proxyUrl: `${environment.supabaseUrl}/functions/v1/ai-chat`,
}),
```

**Available models out of the box:**

| ID | Label | Provider | Key env var |
|----|-------|----------|-------------|
| `llama-3.3-70b-versatile` | Llama 3.3 70B | Groq | `GROQ_API_KEY` |
| `llama-3.1-8b-instant` | Llama 3.1 8B | Groq | `GROQ_API_KEY` |
| `gpt-4o` | GPT-4o | OpenAI | `OPENAI_API_KEY` |
| `gpt-4o-mini` | GPT-4o Mini | OpenAI | `OPENAI_API_KEY` |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic | `ANTHROPIC_API_KEY` |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | Anthropic | `ANTHROPIC_API_KEY` |
| `llama3.2` | Llama 3.2 (Local) | Ollama | none |

---

## Streaming

Tokens stream via an async generator:

```ts
for await (const token of aiService.chat(history)) {
  fullResponse += token;
  // update UI signal per token
}
```

The generator runs **outside Angular's zone** (`NgZone.runOutsideAngular`) to avoid triggering change detection on every token. Each signal write re-enters the zone via `zone.run()` and calls `ChangeDetectorRef.markForCheck()`.

---

## Response Parsing

After streaming finishes, the raw response is parsed by `parseResponse()` in `chat-panel.ts`:

1. All ` ```typst ... ``` ` fenced blocks are extracted into `typstCode`.
2. The remaining prose becomes `displayText`.

The chat bubble shows `displayText`. A styled code preview block appears below it if `typstCode` is non-empty. **"Insertar en editor"** inserts `typstCode` (or `displayText` for consultation answers with no code).

---

## Rate Limiting

Two layers of protection:

| Layer | Where | Limit | Survives reload? |
|-------|-------|-------|-----------------|
| Client-side | `RateLimiter` in `AiService` | 10 req / 60s | No (UX only) |
| Server-side | Edge Function + `ai_requests` table | 10 req / 60s | Yes |

When the server returns HTTP 429, `SupabaseProxyProvider` throws `ProxyRateLimitError`, which `AiService.chat()` converts to `RateLimitError`. `ChatPanel` catches it and shows a countdown timer.

---

## System Prompt

The prompt lives in `src/app/core/service/ai/system-prompt.ts`. Edit that file to change AI behavior — no other file needs to change.

Key rules enforced by the prompt:
- Always wrap Typst in ` ```typst ... ``` ` fenced blocks.
- Always precede code blocks with a 1–3 sentence plain-text explanation.
- For consultation questions (no code needed), reply in plain prose only.
- Match the user's language for all explanations.
- Never invent Typst syntax — say explicitly if unsure.

---

## Edge Function — Adding a New Provider

To support a new AI provider (e.g. Mistral), add it to `MODEL_CONFIGS` in `supabase/functions/ai-chat/index.ts`:

```ts
'mistral-large': {
  baseUrl:   'https://api.mistral.ai/v1',
  apiKeyEnv: 'MISTRAL_API_KEY',
  type:      'openai-compat',   // Mistral uses OpenAI-compat format
  maxTokens: 8192,
},
```

Then add the model to `AI_MODELS` in `ai-model-registry.ts` and set the secret in Supabase:

```
MISTRAL_API_KEY=your-key
```

No Angular code needs to change.

---

## Security Notes

- API keys are **only** in Supabase secrets — not in `environment.ts`, not in Angular bundles.
- The Edge Function verifies the user's JWT before processing any request. Unauthenticated requests receive HTTP 401.
- The `ai_requests` table uses RLS with no client policies — only the service role key (Edge Function) can write to it.
- The client-side rate limiter is a UX guard only. The server enforces the real limit.
