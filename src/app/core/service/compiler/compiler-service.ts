import { Injectable, OnDestroy } from '@angular/core';
import { CompileResponse, SourceFile } from '../../../workers/compiler.worker';
import type { DiagnosticMessage } from '../../../workers/compiler.worker';

export type { DiagnosticMessage };

/** Returned by a successful compile(). */
export interface CompileResult {
  vectorData:  Uint8Array;
  diagnostics: DiagnosticMessage[];
}

/** Thrown by compile() when the document has errors. */
export class CompileError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: DiagnosticMessage[],
  ) {
    super(message);
    this.name = 'CompileError';
  }
}

type PendingRequest =
  | { kind: 'compile'; resolve: (r: CompileResult) => void; reject: (e: Error) => void }
  | { kind: 'pdf';     resolve: (r: Uint8Array)    => void; reject: (e: Error) => void };

/**
 * Angular service that wraps the Typst compiler Web Worker.
 *
 * - `compile()` cancels all in-flight requests and posts a new compile job.
 * - `addFile()` registers a binary asset (image, etc.) in the worker's virtual
 *   filesystem so subsequent compilations can reference it via `#image("...")`.
 */
@Injectable()
export class CompilerService implements OnDestroy {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private requestCounter = 0;

  constructor() {
    this.worker = new Worker(
      new URL('../../../workers/compiler.worker', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = ({ data }: MessageEvent<CompileResponse>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);

      if (data.type === 'error') {
        if (pending.kind === 'compile') {
          pending.reject(new CompileError(data.message, data.diagnostics));
        } else {
          pending.reject(new Error(data.message));
        }
      } else if (data.type === 'pdf-error') {
        pending.reject(new Error(data.message));
      } else if (data.type === 'pdf-success') {
        if (pending.kind === 'pdf') pending.resolve(data.data);
      } else if (data.type === 'success') {
        if (pending.kind === 'compile') {
          pending.resolve({ vectorData: data.vectorData, diagnostics: data.diagnostics });
        }
      }
    };

    this.worker.onerror = (event) => {
      this.rejectAll(new Error(event.message ?? 'Worker error'));
    };
  }

  /**
   * Compiles the given Typst source.
   *
   * `sources` — all project files so the worker can resolve #include / #import.
   * Cancels any in-flight requests — only the latest result matters.
   * Debouncing is the responsibility of the call site (e.g. EditorPage).
   *
   * Resolves with `{ vectorData, diagnostics }` on success (diagnostics may
   * include warnings). Rejects with `CompileError` (which carries diagnostics)
   * when the document has errors.
   */
  compile(content: string, sources: SourceFile[] = []): Promise<CompileResult> {
    this.rejectAll(new Error('Cancelled by a newer compile request'));
    const id = String(this.requestCounter++);
    return new Promise<CompileResult>((resolve, reject) => {
      this.pending.set(id, { kind: 'compile', resolve, reject });
      this.worker.postMessage({ type: 'compile', id, content, sources });
    });
  }

  /**
   * Registers a binary file in the worker's virtual filesystem.
   *
   * After calling this, Typst markup can reference the file by name:
   *   `#image("photo.png")`
   *
   * @param path - Virtual path as seen by Typst, e.g. `"/photo.png"`.
   * @param data - Raw file bytes. The caller's buffer is NOT detached — a copy
   *               is made before transferring to the worker so `data` remains
   *               usable (e.g. for subsequent rename/re-add operations).
   */
  addFile(path: string, data: Uint8Array): void {
    const copy = data.slice();
    this.worker.postMessage({ type: 'add-file', path, data: copy }, [copy.buffer]);
  }

  /** Exports the last compiled document as PDF bytes. */
  exportPdf(): Promise<Uint8Array> {
    const id = String(this.requestCounter++);
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(id, { kind: 'pdf', resolve, reject });
      this.worker.postMessage({ type: 'export-pdf', id });
    });
  }

  removeFile(path: string): void {
    this.worker.postMessage({ type: 'remove-file', path });
  }

  ngOnDestroy(): void {
    this.rejectAll(new Error('Compiler service destroyed'));
    this.worker.terminate();
  }

  private rejectAll(reason: Error): void {
    this.pending.forEach((req) => req.reject(reason));
    this.pending.clear();
  }
}
