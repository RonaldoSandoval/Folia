import type { AiMessage, AiProvider } from '../ai-provider.interface';

const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Provider for the Anthropic (Claude) Messages API.
 *
 * Claude uses a different format from OpenAI:
 *  - Auth header:  x-api-key  (not Authorization: Bearer)
 *  - System prompt: top-level `system` field (not a message with role "system")
 *  - SSE events:   type "content_block_delta" with delta.type "text_delta"
 */
export class AnthropicProvider implements AiProvider {
  constructor(
    private readonly baseUrl:   string,
    private readonly apiKey:    string,
    private readonly modelId:   string,
    private readonly maxTokens: number,
  ) {}

  async *chat(messages: AiMessage[], systemPrompt: string, _documentId?: string): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model:      this.modelId,
        max_tokens: this.maxTokens,
        system:     systemPrompt,
        stream:     true,
        messages:   messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`[AnthropicProvider] ${response.status} ${response.statusText}`);
    }

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
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            // Claude SSE event shape: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
            if (
              parsed?.type === 'content_block_delta' &&
              parsed?.delta?.type === 'text_delta'
            ) {
              const token = parsed.delta.text as string | undefined;
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
