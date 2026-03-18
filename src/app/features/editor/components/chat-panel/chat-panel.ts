import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { ArrowUp, ClipboardPaste, LucideAngularModule, Sparkles } from 'lucide-angular';
import { AiService, type AiMessage } from '../../../../core/service/ai/ai.service';
import { Button } from '../../../../shared/components/button/button';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * AI assistant chat panel.
 *
 * Streams responses token-by-token from the Claude API via `AiService`.
 * Emits `insertContent` when the user clicks "Insertar en editor" so the
 * parent `EditorPage` can append the last assistant message to the editor.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [LucideAngularModule, Button],
  templateUrl: './chat-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class ChatPanel {
  private readonly aiService = inject(AiService);

  readonly Sparkles       = Sparkles;
  readonly ArrowUp        = ArrowUp;
  readonly ClipboardPaste = ClipboardPaste;

  /** Emits the last assistant message text so the editor can insert it. */
  readonly insertContent = output<string>();

  readonly messages  = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy tu asistente de Typst. Dime qué quieres escribir y lo formatearé como contenido Typst válido.',
    },
  ]);

  readonly draft     = signal('');
  readonly isLoading = signal(false);

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.isLoading()) return;

    // Add user message and clear input.
    this.messages.update((msgs) => [...msgs, { role: 'user', text }]);
    this.draft.set('');
    this.isLoading.set(true);

    // Add empty assistant placeholder — will be filled token by token.
    this.messages.update((msgs) => [...msgs, { role: 'assistant', text: '' }]);

    try {
      // Build history (exclude the empty placeholder at the end).
      const history: AiMessage[] = this.messages()
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.text }));

      let fullResponse = '';
      for await (const token of this.aiService.chat(history)) {
        fullResponse += token;
        // Update the last message in place — creates a new array reference
        // so OnPush detects the change.
        this.messages.update((msgs) => {
          const updated = [...msgs];
          updated[updated.length - 1] = { role: 'assistant', text: fullResponse };
          return updated;
        });
      }
    } catch {
      this.messages.update((msgs) => {
        const updated = [...msgs];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: 'Error al conectar con la IA. Verifica que tu API key esté configurada en environment.ts.',
        };
        return updated;
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Emits the last assistant response so EditorPage can insert it. */
  insertLastResponse(): void {
    const last = [...this.messages()].reverse().find((m) => m.role === 'assistant');
    if (last?.text) this.insertContent.emit(last.text);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  updateDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }
}
