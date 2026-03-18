import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL   = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Eres un asistente especializado en Typst, un lenguaje de marcado moderno para documentos científicos y técnicos.

Cuando el usuario te pida contenido, responde SIEMPRE con bloques Typst válidos y bien formateados.
Usa la sintaxis correcta de Typst:
- Encabezados con = (nivel 1), == (nivel 2), etc.
- Listas con -
- Ecuaciones en línea con $...$, en bloque con $ ... $
- Código con \`\`\`
- Negrita con *texto*, cursiva con _texto_
- Citas con #quote[...]
- Figuras con #figure(...)

Responde en el mismo idioma que el usuario.
Sé conciso y directo. No incluyas explicaciones fuera del bloque Typst a menos que el usuario lo pida.`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AiService {
  /**
   * Sends the conversation history to Groq and yields response tokens
   * as an `AsyncIterable<string>` for progressive streaming in the UI.
   *
   * Groq follows the OpenAI-compatible SSE format:
   *   data: {"choices":[{"delta":{"content":"token"}}]}
   *
   * @throws Error if the API responds with a non-200 status.
   */
  async *chat(messages: AiMessage[]): AsyncIterable<string> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${environment.groqApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Error de API: ${response.status} ${response.statusText}`);
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
            // Groq / OpenAI-compatible streaming format
            const token = parsed?.choices?.[0]?.delta?.content as string | undefined;
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

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function provideAiService() {
  return { provide: AiService, useClass: AiService };
}
