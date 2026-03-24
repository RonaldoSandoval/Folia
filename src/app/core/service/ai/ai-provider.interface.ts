// ---------------------------------------------------------------------------
// Shared message type (used by ChatPanel, AiService, and all providers)
// ---------------------------------------------------------------------------

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Provider contract
//
// Every AI provider (Groq, OpenAI, Anthropic, Ollama…) must implement this.
// AiService only depends on this interface — never on a concrete provider.
// ---------------------------------------------------------------------------

export interface AiProvider {
  /**
   * Sends the conversation history and system prompt to the underlying model.
   * Yields response tokens progressively for streaming UI updates.
   */
  chat(messages: AiMessage[], systemPrompt: string, documentId?: string): AsyncIterable<string>;
}
