import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AlignLeft, LucideAngularModule } from 'lucide-angular';

export interface OutlineHeading {
  /** Heading level: 1 = `=`, 2 = `==`, etc. */
  level: number;
  text:  string;
  /** 1-based line number in the source document. */
  line:  number;
  /** Formatted number (e.g. "1.", "1.2") when the document uses heading numbering. */
  number?: string;
}

@Component({
  selector: 'app-outline-panel',
  imports: [LucideAngularModule],
  templateUrl: './outline-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full overflow-hidden' },
})
export class OutlinePanel {
  protected readonly AlignLeft = AlignLeft;

  readonly headings     = input<OutlineHeading[]>([]);
  readonly headingClick = output<OutlineHeading>();

  /** Left padding (px) per heading level so the tree feels indented. */
  protected indent(level: number): number {
    return 8 + (level - 1) * 12;
  }
}
