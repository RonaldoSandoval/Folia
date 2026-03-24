import type { AiMessage, AiProvider } from '../ai-provider.interface';

/**
 * Provider for any API that follows the OpenAI chat-completions spec.
 *
 * Compatible with: Groq, OpenAI, Ollama, Together AI, Mistral, Perplexity, etc.
 * They all share the same request body and SSE response format.
 * Only `baseUrl`, `apiKey`, and `modelId` differ between them.
 */
export class OpenAiCompatProvider implements AiProvider {
  constructor(
    private readonly baseUrl:  string,
    private readonly apiKey:   string,
    private readonly modelId:  string,
    private readonly maxTokens: number,
  ) {}

  async *chat(messages: AiMessage[], systemPrompt: string, _documentId?: string): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:      this.modelId,
        max_tokens: this.maxTokens,
        stream:     true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`[OpenAiCompatProvider] ${response.status} ${response.statusText}`);
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
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const token  = parsed?.choices?.[0]?.delta?.content as string | undefined;
            if (token) yield token;
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
