import { Inject, Injectable, inject } from '@angular/core';
import { AI_CONFIG, AI_MODELS, type AiConfig, type AiModelDef } from './ai-model-registry';
import type { AiMessage, AiProvider } from './ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiCompatProvider } from './providers/openai-compat.provider';
import { SupabaseProxyProvider, ProxyRateLimitError } from './providers/supabase-proxy.provider';
import { RateLimiter } from './rate-limiter';
import { SYSTEM_PROMPT } from './system-prompt';
import { SUPABASE } from '../supabase/supabase.client';

// ---------------------------------------------------------------------------
// Client-side rate-limit configuration
// (UX safeguard only — the Edge Function enforces the real limit server-side)
// ---------------------------------------------------------------------------

/** Maximum AI requests per user per sliding window (client-side UX guard). */
const RATE_LIMIT_MAX    = 10;
/** Width of the sliding window in milliseconds (1 minute). */
const RATE_LIMIT_WINDOW = 60_000;

/** Error thrown when the rate limit is exceeded. Caught by ChatPanel for user feedback. */
export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    const seconds = Math.ceil(retryAfterMs / 1_000);
    super(`Límite alcanzado. Intenta de nuevo en ${seconds}s.`);
    this.name = 'RateLimitError';
  }
}

export type { AiMessage };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Orchestrator — the only AI-related class that the rest of the app imports.
 *
 * Security model:
 *  - In production, traffic goes through a Supabase Edge Function (proxyUrl).
 *    API keys are stored as Supabase secrets — they never reach the browser.
 *  - Rate limiting is enforced server-side (DB-backed, survives page reloads).
 *    The client-side RateLimiter below provides fast UX feedback only.
 *  - For local dev with Ollama (no key), set apiKey: '' in provideAiConfig().
 *
 * To switch model or provider: edit provideAiConfig() in app.config.ts.
 */
@Injectable()
export class AiService {
  private readonly supabase = inject(SUPABASE);
  private readonly provider: AiProvider;

  /** The active model definition — useful for displaying the model name in the UI. */
  readonly activeModel: AiModelDef;

  /** Full catalog of available models — use this to build a model selector. */
  readonly availableModels: AiModelDef[] = AI_MODELS;

  private readonly limiter = new RateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);

  constructor(@Inject(AI_CONFIG) config: AiConfig) {
    this.activeModel = config.model;
    this.provider    = this.resolveProvider(config);
  }

  /**
   * Streams the AI response token by token.
   *
   * @param messages  Conversation history (last N exchanges).
   * @param context   Optional document context — active selection or document header.
   *                  Appended to the system prompt so the model can reference the
   *                  current document without the caller managing prompt construction.
   * @throws {RateLimitError} when the client-side UX guard or server-side limit is hit.
   */
  async *chat(
    messages: AiMessage[],
    context?: string,
    documentId?: string,
    systemPromptOverride?: string,
  ): AsyncIterable<string> {
    // Fast client-side check for immediate UX feedback.
    const result = this.limiter.consume();
    if (!result.allowed) throw new RateLimitError(result.retryAfterMs);

    const systemPrompt = systemPromptOverride
      ?? (context?.trim()
        ? `${SYSTEM_PROMPT}\n\n## Contexto del documento actual\n\`\`\`typst\n${context}\n\`\`\``
        : SYSTEM_PROMPT);

    try {
      yield* this.provider.chat(messages, systemPrompt, documentId);
    } catch (err) {
      // Convert server-side 429 (ProxyRateLimitError) to the same RateLimitError
      // the ChatPanel already handles — so no changes needed in the UI layer.
      if (err instanceof ProxyRateLimitError) {
        throw new RateLimitError(err.retryAfterMs);
      }
      throw err;
    }
  }

  /** Remaining request slots in the current client-side window. */
  get requestsRemaining(): number {
    return this.limiter.remaining;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private resolveProvider(config: AiConfig): AiProvider {
    // Production path: all traffic goes through the Edge Function proxy.
    if (config.proxyUrl) {
      return new SupabaseProxyProvider(
        config.proxyUrl,
        () => this.supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null),
        config.model.id,
        config.model.providerType,
      );
    }

    // Dev/local fallback: direct API call (only for Ollama or explicit dev setup).
    const { model, apiKey = '' } = config;
    switch (model.providerType) {
      case 'openai-compat':
        return new OpenAiCompatProvider(model.baseUrl, apiKey, model.id, model.maxTokens);
      case 'anthropic':
        return new AnthropicProvider(model.baseUrl, apiKey, model.id, model.maxTokens);
    }
  }
}

// ---------------------------------------------------------------------------
// Provider factory — used in app.config.ts
// ---------------------------------------------------------------------------

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}
