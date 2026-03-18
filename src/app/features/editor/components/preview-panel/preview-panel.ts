import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  effect,
  input,
  viewChild,
  ElementRef,
} from '@angular/core';
import { $typst } from '@myriaddreamin/typst.ts';

/**
 * Renders compiled Typst vector data onto canvas elements using `$typst.canvas()`.
 *
 * Strategy:
 * - `$typst.setRendererInitOptions()` is called once in `ngOnInit`.
 * - An `effect()` watches `vectorData` + the `#canvasContainer` viewChild signal.
 *   It fires after Angular's CD cycle so the container div is guaranteed to be
 *   in the DOM when we call `$typst.canvas()`.
 * - A render-version counter ensures that if a newer render starts before the
 *   current one finishes, errors from the stale render are silently discarded.
 *   `$typst.canvas()` does not support cancellation, so both renders will run
 *   to completion; the last one to finish writes the final DOM state, which is
 *   always correct.
 */
@Component({
  selector: 'app-preview-panel',
  templateUrl: './preview-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full items-start justify-center overflow-auto bg-[#f5f5f0] p-8' },
})
export class PreviewPanel implements OnInit, OnDestroy {
  /** Compiled Typst vector data from CompilerService. `null` = not yet compiled. */
  vectorData = input<Uint8Array | null>(null);

  private readonly canvasContainer =
    viewChild<ElementRef<HTMLDivElement>>('canvasContainer');

  /**
   * Monotonically increasing counter. Incremented at the start of every render.
   * A render whose version no longer matches `renderVersion` on completion is
   * considered stale and its errors are suppressed.
   */
  private renderVersion = 0;

  constructor() {
    effect(() => {
      const data      = this.vectorData();
      const container = this.canvasContainer()?.nativeElement;
      if (!data || !container) return;
      this.render(data, container);
    });
  }

  ngOnInit(): void {
    $typst.setRendererInitOptions({
      getModule: () => '/assets/typst_ts_renderer_bg.wasm',
    });
  }

  ngOnDestroy(): void {
    // Invalidate any in-flight render so its error handler becomes a no-op.
    this.renderVersion = Number.MAX_SAFE_INTEGER;
  }

  private async render(vectorData: Uint8Array, container: HTMLDivElement): Promise<void> {
    const version = ++this.renderVersion;

    try {
      await $typst.canvas(container, {
        vectorData,
        pixelPerPt: window.devicePixelRatio || 2,
        backgroundColor: '#ffffff',
      });
    } catch (err) {
      // Suppress errors from stale renders — a newer one is already in progress.
      if (version !== this.renderVersion) return;
      console.error('[PreviewPanel]', err);
    }
  }
}
