import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { createTypstRenderer } from '@myriaddreamin/typst.ts';
import { withGlobalRenderer } from '@myriaddreamin/typst.ts/contrib/global-renderer';
import {
  ChevronLeft,
  ChevronRight,
  LucideAngularModule,
  Maximize2,
  Minus,
  Play,
  Plus,
  X,
} from 'lucide-angular';

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
const ZOOM_MIN   = ZOOM_STEPS[0];
const ZOOM_MAX   = ZOOM_STEPS[ZOOM_STEPS.length - 1];

const RENDERER_OPTIONS = {
  getModule: () => '/assets/typst_ts_renderer_bg.wasm',
  beforeBuild: [] as [],
};

/**
 * Renders compiled Typst vector data using the same rendering pipeline as
 * typst.app: `withGlobalRenderer` + `createTypstRenderer` from `@myriaddreamin/typst.ts`.
 *
 * This produces a canvas layer + HTML semantic overlay (text selection, links)
 * identical to the official `<typst-document>` component, but wired directly so
 * we fully control the render lifecycle without `@ViewChild` timing issues.
 */
@Component({
  selector: 'app-preview-panel',
  imports: [LucideAngularModule],
  templateUrl: './preview-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full overflow-hidden' },
  styles: [`
    :host ::ng-deep .typst-page {
      margin-bottom: 16px;
      border-radius: 2px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }
    :host ::ng-deep .typst-page:last-child {
      margin-bottom: 0;
    }
  `],
})
export class PreviewPanel implements AfterViewInit, OnDestroy {
  /** Compiled Typst vector data from CompilerService. `null` = not yet compiled. */
  readonly vectorData = input<Uint8Array | null>(null);

  protected readonly Minus        = Minus;
  protected readonly Plus         = Plus;
  protected readonly Maximize2    = Maximize2;
  protected readonly Play         = Play;
  protected readonly ChevronLeft  = ChevronLeft;
  protected readonly ChevronRight = ChevronRight;
  protected readonly X            = X;

  // ── Zoom state ─────────────────────────────────────────────────────────────

  protected readonly zoom      = signal(1.0);
  /** True while the mouse cursor is over the scroll area. */
  readonly isHovered = signal(false);
  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  protected readonly canZoomIn  = computed(() => this.zoom() < ZOOM_MAX);
  protected readonly canZoomOut = computed(() => this.zoom() > ZOOM_MIN);

  // ── Presentation state ─────────────────────────────────────────────────────

  protected readonly presentationActive = signal(false);
  protected readonly currentSlide       = signal(0);
  protected readonly slideCount         = signal(0);

  /**
   * PNG data URLs captured from each rendered `.typst-page` canvas.
   * `canvas.toDataURL()` reads the already-painted pixels directly — no WASM
   * re-render needed, and it works without any DOM-injection timing issues.
   */
  private slideDataUrls: string[] = [];

  protected readonly currentSlideUrl = computed(
    () => this.slideDataUrls[this.currentSlide()] ?? '',
  );

  // ── View refs ──────────────────────────────────────────────────────────────

  private readonly container  = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly scrollArea = viewChild<ElementRef<HTMLDivElement>>('scrollArea');

  /** True once ngAfterViewInit has fired and the container is in the DOM. */
  private viewReady = false;

  /** Non-passive wheel handler stored as arrow fn for removeEventListener. */
  private readonly handleWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.deltaY < 0 ? this.zoomIn() : this.zoomOut();
  };

  constructor() {
    effect(() => {
      const data = this.vectorData();
      if (!data || !this.viewReady) return;
      this.render(data);
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    // If vectorData arrived before the view was ready, render now.
    const data = this.vectorData();
    if (data) this.render(data);

    this.scrollArea()?.nativeElement.addEventListener('wheel', this.handleWheel, {
      passive: false,
    });
  }

  ngOnDestroy(): void {
    this.scrollArea()?.nativeElement.removeEventListener('wheel', this.handleWheel);
    if (this.presentationActive()) document.body.style.overflow = '';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  private render(vectorData: Uint8Array): void {
    const el = this.container().nativeElement;
    withGlobalRenderer(
      createTypstRenderer,
      RENDERER_OPTIONS,
      (renderer) => {
        renderer.render({
          artifactContent: vectorData,
          format:          'vector',
          backgroundColor: '#ffffff',
          container:       el,
          pixelPerPt:      3,
        });
      },
      () => {},
    );
  }

  // ── Zoom actions ───────────────────────────────────────────────────────────

  protected zoomIn(): void {
    const next = ZOOM_STEPS.find((s) => s > this.zoom());
    if (next !== undefined) this.zoom.set(next);
  }

  protected zoomOut(): void {
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < this.zoom());
    if (prev !== undefined) this.zoom.set(prev);
  }

  protected resetZoom(): void {
    this.zoom.set(1.0);
  }

  /**
   * Captures the first rendered page as a 400-px-wide PNG blob.
   *
   * Reads directly from the canvas that the renderer already painted into the
   * container — no WASM renderer call needed, so there is no risk of conflicting
   * with an in-progress render cycle.
   *
   * Returns `null` when the preview is not yet rendered or the canvas is empty.
   */
  async captureFirstPage(): Promise<Blob | null> {
    const src = this.container().nativeElement.querySelector('canvas');
    if (!src || src.width === 0) return null;

    const W   = 400;
    const H   = Math.round(src.height * (W / src.width));
    const out = document.createElement('canvas');
    out.width  = W;
    out.height = H;

    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, 0, 0, W, H);

    // JPEG at 0.75 quality — sharp enough for card previews (~20–50 KB as base64).
    return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.75));
  }

  protected fitWidth(): void {
    const scroll  = this.scrollArea()?.nativeElement;
    const wrapper = this.container().nativeElement;
    if (!scroll || !wrapper) return;

    const widthAtZoom1 = wrapper.offsetWidth / this.zoom();
    if (widthAtZoom1 <= 0) return;

    const available = scroll.clientWidth - 64;
    const fit = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, available / widthAtZoom1));
    this.zoom.set(parseFloat(fit.toFixed(2)));
  }

  // ── Presentation ───────────────────────────────────────────────────────────

  protected enterPresentation(): void {
    const pages = Array.from(
      this.container().nativeElement.querySelectorAll('.typst-page'),
    ) as HTMLElement[];
    if (!pages.length) return;

    // Capture each page by reading the pixels the WASM renderer already painted
    // onto its canvas. toDataURL() works on same-origin canvases without re-rendering.
    const urls = pages
      .map((page) => {
        const canvas = page.querySelector('canvas') as HTMLCanvasElement | null;
        return canvas?.width ? canvas.toDataURL('image/png') : '';
      })
      .filter(Boolean);

    if (!urls.length) return;

    this.slideDataUrls = urls;
    this.slideCount.set(urls.length);
    this.currentSlide.set(0);
    this.presentationActive.set(true);
    document.body.style.overflow = 'hidden';
  }

  protected exitPresentation(): void {
    this.presentationActive.set(false);
    document.body.style.overflow = '';
    this.slideDataUrls = [];
  }

  protected prevSlide(): void {
    if (this.currentSlide() > 0) this.currentSlide.update((s) => s - 1);
  }

  protected nextSlide(): void {
    if (this.currentSlide() < this.slideCount() - 1) this.currentSlide.update((s) => s + 1);
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  @HostListener('window:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    // Presentation mode shortcuts take priority.
    if (this.presentationActive()) {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          event.preventDefault();
          this.nextSlide();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          this.prevSlide();
          break;
        case 'Escape':
          event.preventDefault();
          this.exitPresentation();
          break;
      }
      return;
    }

    // Zoom shortcuts — only when cursor is over the preview panel.
    if (!this.isHovered()) return;
    if (!event.ctrlKey && !event.metaKey) return;
    switch (event.key) {
      case '=':
      case '+':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.resetZoom();
        break;
    }
  }
}
