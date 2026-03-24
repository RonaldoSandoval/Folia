import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ArrowUp, ClipboardPaste, LucideAngularModule, Sparkles, Trash2, X, Zap } from 'lucide-angular';
import { AiService, RateLimitError, type AiMessage } from '../../../../core/service/ai/ai.service';
import { Button } from '../../../../shared/components/button/button';

interface ChatMessage {
  role: 'user' | 'assistant';
  /** Raw streamed text (shown only during streaming). */
  text: string;
  /** Selected editor text quoted by the user when they clicked "Ask AI". */
  quotedText?: string;
  /** Human-readable explanation stripped of Typst code blocks. */
  displayText?: string;
  /** Extracted Typst code (content inside ```typst blocks). */
  typstCode?: string;
}

/**
 * Splits an AI response into a human-readable part and extracted Typst code.
 * All ```typst ... ``` fenced blocks are extracted into typstCode (joined with \n\n).
 * The remaining prose becomes displayText.
 */
function parseResponse(raw: string): { displayText: string; typstCode: string } {
  const codeBlockRegex = /```typst\s*([\s\S]*?)```/g;
  const typstParts: string[] = [];
  const displayText = raw.replace(codeBlockRegex, (_match, code: string) => {
    typstParts.push(code.trim());
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();

  return { displayText, typstCode: typstParts.join('\n\n') };
}

@Component({
  selector: 'app-chat-panel',
  imports: [LucideAngularModule, Button],
  templateUrl: './chat-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class ChatPanel {
  protected readonly aiService = inject(AiService);
  private  readonly zone       = inject(NgZone);
  private  readonly cdr        = inject(ChangeDetectorRef);

  protected readonly Sparkles       = Sparkles;
  protected readonly ArrowUp        = ArrowUp;
  protected readonly ClipboardPaste = ClipboardPaste;
  protected readonly Trash2         = Trash2;
  protected readonly X              = X;
  protected readonly Zap            = Zap;

  protected readonly quickActions = [
    { label: 'Escribir sección',  prompt: 'Escribe una sección completa sobre '                 },
    { label: 'Crear tabla',       prompt: 'Crea una tabla en Typst que muestre '                },
    { label: 'Agregar ecuación',  prompt: 'Escribe la ecuación matemática de '                  },
    { label: 'Mejorar texto',     prompt: 'Mejora y reformatea este texto como Typst válido:\n' },
    { label: 'Plantilla',         prompt: 'Genera un template de Typst completo para '          },
  ] as const;

  /**
   * Callback that returns the current document context (selection or header lines).
   * Provided by EditorPage so the context is read at send-time, not reactively tracked.
   */
  readonly contextProvider = input<() => string>(() => '');

  /** Document ID forwarded to the Edge Function for server-side role validation. */
  readonly documentId = input<string>('');

  /** Emits the last assistant message text so the editor can insert it. */
  readonly insertContent = output<string>();

  private readonly messageList    = viewChild<ElementRef<HTMLDivElement>>('messageList');
  private readonly draftTextarea  = viewChild<ElementRef<HTMLTextAreaElement>>('draftTextarea');

  readonly messages       = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy tu asistente de Folia. ¿En qué puedo ayudarte hoy?',
      displayText: '¡Hola! Soy tu asistente de Folia. ¿En qué puedo ayudarte hoy?',
      typstCode: '',
    },
  ]);

  readonly draft          = signal('');
  readonly isStreaming    = signal(false);
  readonly rateLimitUntil = signal<number | null>(null);
  readonly rateLimitSecs  = signal(0);

  /** Selected editor text to quote in the next message. Set by EditorPage via setQuotedContext(). */
  readonly quotedContext  = signal<string | null>(null);

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  // ── Send ───────────────────────────────────────────────────────────────────

  async send(): Promise<void> {
    const text    = this.draft().trim();
    const quoted  = this.quotedContext();
    if (!text || this.isStreaming() || this.rateLimitUntil() !== null) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', text, quotedText: quoted ?? undefined }]);
    this.draft.set('');
    this.quotedContext.set(null);
    this.resetTextareaHeight();
    this.isStreaming.set(true);
    // Empty assistant placeholder — cursor shown while streaming.
    this.messages.update((msgs) => [...msgs, { role: 'assistant', text: '' }]);
    this.scrollToBottom();

    try {
      // Keep only the last 20 messages (10 exchanges) to limit token usage.
      const MAX_HISTORY = 20;
      const history: AiMessage[] = this.messages()
        .slice(0, -1)
        .slice(-MAX_HISTORY)
        .map((m) => ({
          role: m.role,
          // For user messages with a quoted selection, prefix the quote so the AI
          // knows exactly which fragment the question refers to.
          content: m.quotedText
            ? `Sobre este fragmento del documento:\n\n"${m.quotedText}"\n\n${m.text}`
            : m.text,
        }));

      let fullResponse = '';
      const context = this.contextProvider()();

      // Run the async generator OUTSIDE Angular's zone so the tight per-token
      // loop doesn't trigger change detection on every microtask. Instead we
      // batch the DOM update manually with markForCheck() after each token.
      await this.zone.runOutsideAngular(async () => {
        for await (const token of this.aiService.chat(history, context, this.documentId())) {
          fullResponse += token;

          // Re-enter the zone only for the signal write so OnPush picks it up.
          this.zone.run(() => {
            this.messages.update((msgs) => {
              const updated = [...msgs];
              // During streaming show raw text so user sees progress.
              updated[updated.length - 1] = { role: 'assistant', text: fullResponse };
              return updated;
            });
            this.cdr.markForCheck();
            this.scrollToBottom();
          });
        }
      });

      // Streaming finished — parse into readable display + extracted Typst.
      const { displayText, typstCode } = parseResponse(fullResponse);
      this.messages.update((msgs) => {
        const updated = [...msgs];
        updated[updated.length - 1] = { role: 'assistant', text: fullResponse, displayText, typstCode };
        return updated;
      });

    } catch (err) {
      if (err instanceof RateLimitError) {
        this.startCooldown(err.retryAfterMs);
        this.messages.update((msgs) => msgs.slice(0, -1));
      } else {
        this.messages.update((msgs) => {
          const updated = [...msgs];
          updated[updated.length - 1] = {
            role: 'assistant',
            text: 'Error al conectar con la IA. Verifica que tu API key esté configurada.',
          };
          return updated;
        });
      }
    } finally {
      this.isStreaming.set(false);
      this.cdr.markForCheck();
      this.scrollToBottom();
    }
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────

  private scrollToBottom(): void {
    const el = this.messageList()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ── Rate limit cooldown ────────────────────────────────────────────────────

  private startCooldown(retryAfterMs: number): void {
    const until = Date.now() + retryAfterMs;
    this.rateLimitUntil.set(until);
    this.rateLimitSecs.set(Math.ceil(retryAfterMs / 1_000));

    if (this.countdownTimer !== null) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const remaining = Math.ceil((until - Date.now()) / 1_000);
      if (remaining <= 0) {
        this.rateLimitUntil.set(null);
        this.rateLimitSecs.set(0);
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
      } else {
        this.rateLimitSecs.set(remaining);
      }
      this.cdr.markForCheck();
    }, 500);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  insertResponse(msg: ChatMessage): void {
    const content = msg.typstCode || msg.displayText || msg.text;
    if (content) this.insertContent.emit(content);
  }

  applyQuickAction(prompt: string): void {
    this.draft.set(prompt);
    // Focus + move cursor to end after Angular flushes the [value] binding.
    queueMicrotask(() => {
      const el = this.draftTextarea()?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      this.autoGrow();
    });
  }

  /** Called by EditorPage when the user clicks "Ask AI" on a selection. */
  setQuotedContext(text: string): void {
    this.quotedContext.set(text);
  }

  clearQuotedContext(): void {
    this.quotedContext.set(null);
  }

  clearChat(): void {
    this.messages.set([{
      role: 'assistant',
      text: '¡Hola! Soy tu asistente de Folia. ¿En qué puedo ayudarte hoy?',
      displayText: '¡Hola! Soy tu asistente de Folia. ¿En qué puedo ayudarte hoy?',
      typstCode: '',
    }]);
    this.draft.set('');
    this.quotedContext.set(null);
    this.resetTextareaHeight();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  updateDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.autoGrow();
  }

  private autoGrow(): void {
    const el = this.draftTextarea()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    // Cap at 6 lines (~132 px for 14 px font / 1.625 line-height).
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }

  private resetTextareaHeight(): void {
    const el = this.draftTextarea()?.nativeElement;
    if (el) el.style.height = '';
  }
}
