import type { AiMessage, AiProvider } from '../ai-provider.interface';

/** Sentinel error thrown when the Edge Function returns HTTP 429. */
export class ProxyRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate limit exceeded. Retry in ${Math.ceil(retryAfterMs / 1_000)}s.`);
    this.name = 'ProxyRateLimitError';
  }
}

/**
 * AiProvider that delegates every request to a Supabase Edge Function.
 *
 * Benefits vs. calling the AI provider directly from the browser:
 *  - API keys never leave the server (stored as Supabase secrets).
 *  - Rate limiting is enforced server-side, survives page reloads.
 *  - Adding or switching providers only requires updating the Edge Function.
 *
 * The Edge Function streams the upstream SSE response back unchanged,
 * so this provider still parses the native provider format.
 */
export class SupabaseProxyProvider implements AiProvider {
  constructor(
    /** Full URL of the ai-chat Edge Function. */
    private readonly proxyUrl: string,
    /** Async getter for the current user's JWT — used for Edge Function auth. */
    private readonly getAuthToken: () => Promise<string | null>,
    private readonly modelId:      string,
    private readonly providerType: 'openai-compat' | 'anthropic',
  ) {}

  async *chat(messages: AiMessage[], systemPrompt: string, documentId?: string): AsyncIterable<string> {
    const token = await this.getAuthToken();
    if (!token) throw new Error('[SupabaseProxyProvider] No auth token — user not logged in.');

    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, modelId: this.modelId, systemPrompt, documentId }),
    });

    if (response.status === 429) {
      const body = await response.json() as { retryAfterMs?: number };
      throw new ProxyRateLimitError(body.retryAfterMs ?? 60_000);
    }

    if (!response.ok || !response.body) {
      throw new Error(`[SupabaseProxyProvider] ${response.status} ${response.statusText}`);
    }

    // Parse the SSE stream from the upstream provider (passed through as-is).
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;

          try {
            const parsed = JSON.parse(data);

            if (this.providerType === 'anthropic') {
              // Anthropic SSE: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
              if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta') {
                const token = parsed.delta.text as string | undefined;
                if (token) yield token;
              }
            } else {
              // OpenAI-compat SSE: { choices: [{ delta: { content: "..." } }] }
              const token = parsed?.choices?.[0]?.delta?.content as string | undefined;
              if (token) yield token;
            }
          } catch {
            // Incomplete SSE chunk — skip.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
