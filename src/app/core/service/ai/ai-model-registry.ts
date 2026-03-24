import { InjectionToken } from '@angular/core';

// ---------------------------------------------------------------------------
// Provider types
// ---------------------------------------------------------------------------

/**
 * 'openai-compat' covers any API that follows the OpenAI chat-completions spec:
 *   Groq, OpenAI, Ollama, Together AI, Mistral, etc.
 *   They all share the same request/response format — only baseUrl and apiKey differ.
 *
 * 'anthropic' is Claude's own API format (different headers, body, and SSE events).
 */
export type AiProviderType = 'openai-compat' | 'anthropic';

// ---------------------------------------------------------------------------
// Model definition
// ---------------------------------------------------------------------------

export interface AiModelDef {
  /** Identifier sent to the API (must match the provider's model name exactly). */
  id: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Which provider implementation to use. */
  providerType: AiProviderType;
  /** Base URL without trailing slash (e.g. 'https://api.groq.com/openai/v1'). */
  baseUrl: string;
  /** Maximum tokens the model can generate per response. */
  maxTokens: number;
  /** Short description shown in model selector tooltips. */
  description: string;
}

// ---------------------------------------------------------------------------
// Model catalog
//
// To add a new model: add an entry here and supply its apiKey in AiConfig.
// To switch the active model: change the id in provideAiConfig() in app.config.ts.
// ---------------------------------------------------------------------------

export const AI_MODELS: AiModelDef[] = [

  // ── Groq (OpenAI-compatible, very fast inference) ──────────────────────────
  {
    id:           'llama-3.3-70b-versatile',
    label:        'Llama 3.3 70B',
    providerType: 'openai-compat',
    baseUrl:      'https://api.groq.com/openai/v1',
    maxTokens:    8192,
    description:  'Best quality on Groq. Balanced speed and capability.',
  },
  {
    id:           'llama-3.1-8b-instant',
    label:        'Llama 3.1 8B (Fast)',
    providerType: 'openai-compat',
    baseUrl:      'https://api.groq.com/openai/v1',
    maxTokens:    8192,
    description:  'Fastest Groq model. Great for quick formatting tasks.',
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    id:           'gpt-4o',
    label:        'GPT-4o',
    providerType: 'openai-compat',
    baseUrl:      'https://api.openai.com/v1',
    maxTokens:    4096,
    description:  'OpenAI flagship. Excellent reasoning and instruction following.',
  },
  {
    id:           'gpt-4o-mini',
    label:        'GPT-4o Mini',
    providerType: 'openai-compat',
    baseUrl:      'https://api.openai.com/v1',
    maxTokens:    4096,
    description:  'Faster and cheaper OpenAI model. Good for most tasks.',
  },

  // ── Anthropic (Claude) ─────────────────────────────────────────────────────
  {
    id:           'claude-sonnet-4-6',
    label:        'Claude Sonnet 4.6',
    providerType: 'anthropic',
    baseUrl:      'https://api.anthropic.com',
    maxTokens:    8192,
    description:  'Anthropic flagship. Exceptional at structured document generation.',
  },
  {
    id:           'claude-haiku-4-5-20251001',
    label:        'Claude Haiku 4.5',
    providerType: 'anthropic',
    baseUrl:      'https://api.anthropic.com',
    maxTokens:    4096,
    description:  'Fast and affordable Claude model.',
  },

  // ── Ollama (local, no API key required) ────────────────────────────────────
  {
    id:           'llama3.2',
    label:        'Llama 3.2 (Local)',
    providerType: 'openai-compat',
    baseUrl:      'http://localhost:11434/v1',
    maxTokens:    4096,
    description:  'Runs locally via Ollama. No API key needed. Requires Ollama installed.',
  },
];

/** Look up a model definition by id. Throws if not found. */
export function getModelById(id: string): AiModelDef {
  const model = AI_MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`[AiModelRegistry] Unknown model id: "${id}"`);
  return model;
}

// ---------------------------------------------------------------------------
// AiConfig — injected into AiService to select the active model + provider
//
// Configured once in app.config.ts via provideAiConfig().
// To switch model: change the first argument to any id from AI_MODELS.
// ---------------------------------------------------------------------------

export interface AiConfig {
  /** The active model definition (from AI_MODELS). */
  model: AiModelDef;
  /**
   * Supabase Edge Function URL for the ai-chat proxy.
   * API keys live on the server as Supabase secrets — NEVER pass them from the client.
   * Use this in all environments where real keys are required.
   */
  proxyUrl?: string;
  /**
   * Direct API key — only for local development (e.g. Ollama, which has no key).
   * NEVER set this to a real production key in environment.ts.
   */
  apiKey?: string;
}

export const AI_CONFIG = new InjectionToken<AiConfig>('AI_CONFIG');

/** Factory helper — call this in app.config.ts providers array. */
export function provideAiConfig(
  modelId: string,
  source: { proxyUrl: string } | { apiKey: string },
) {
  return {
    provide:  AI_CONFIG,
    useValue: { model: getModelById(modelId), ...source } satisfies AiConfig,
  };
}
