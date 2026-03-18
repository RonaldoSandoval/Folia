import { Injectable, OnDestroy } from '@angular/core';
import { CompileResponse } from '../../../workers/compiler.worker';

interface PendingRequest {
  resolve: (value: Uint8Array) => void;
  reject:  (reason: Error)    => void;
}

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
        pending.reject(new Error(data.message));
      } else {
        pending.resolve(data.vectorData);
      }
    };

    this.worker.onerror = (event) => {
      this.rejectAll(new Error(event.message ?? 'Worker error'));
    };
  }

  /**
   * Compiles the given Typst source.
   * Cancels any in-flight requests — only the latest result matters.
   */
  compile(content: string): Promise<Uint8Array> {
    this.rejectAll(new Error('Cancelled by a newer compile request'));
    const id = String(this.requestCounter++);
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'compile', id, content });
    });
  }

  /**
   * Registers a binary file in the worker's virtual filesystem.
   *
   * After calling this, Typst markup can reference the file by name:
   *   `#image("photo.png")`
   *
   * The buffer is transferred (zero-copy). Do not reuse `data` after this call.
   *
   * @param path - Virtual path as seen by Typst, e.g. `"/photo.png"`.
   * @param data - Raw file bytes.
   */
  addFile(path: string, data: Uint8Array): void {
    this.worker.postMessage({ type: 'add-file', path, data }, [data.buffer]);
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
