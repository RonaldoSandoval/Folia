import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Modal } from '../../../../shared/components/modal/modal';
import { Button } from '../../../../shared/components/button/button';

export interface ExportSelection {
  /** 1-based page number, or `'all'` to export every page as a ZIP. */
  page: number | 'all';
}

@Component({
  selector: 'app-export-dialog',
  imports: [Modal, Button],
  templateUrl: './export-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  readonly format    = input.required<'svg' | 'png'>();
  readonly pageCount = input.required<number>();

  readonly confirm = output<ExportSelection>();
  readonly cancel  = output<void>();

  protected readonly mode    = signal<'specific' | 'all'>('specific');
  protected readonly pageNum = signal(1);

  protected readonly title = computed(() =>
    this.format() === 'svg' ? 'Exportar como SVG' : 'Exportar como PNG',
  );

  protected readonly clampedPage = computed(() =>
    Math.max(1, Math.min(this.pageNum(), this.pageCount())),
  );

  protected onPageInput(event: Event): void {
    const n = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(n)) this.pageNum.set(n);
  }

  protected onConfirm(): void {
    this.confirm.emit({ page: this.mode() === 'all' ? 'all' : this.clampedPage() });
  }
}
