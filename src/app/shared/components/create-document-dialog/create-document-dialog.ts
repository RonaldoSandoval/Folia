import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from '../button/button';
import { Modal } from '../modal/modal';
import type { ProjectAsset, ProjectFile } from '../../../core/service/document/document.service';
import {
  TypstUniverseService,
  type UniverseTemplate,
} from '../../../core/service/typst-universe/typst-universe.service';

/** Synthetic blank-document entry shown as the first card in the gallery. */
const BLANK: UniverseTemplate = {
  name: '__blank__',
  version: '',
  description: 'Documento vacío para empezar desde cero.',
  categories: [],
  keywords: [],
  template: { path: '', entrypoint: 'main.typ', thumbnail: '' },
};

export interface CreateDocumentEvent {
  title: string;
  files: ProjectFile[];
  assets: ProjectAsset[];
}

@Component({
  selector: 'app-create-document-dialog',
  imports: [Modal, Button],
  templateUrl: './create-document-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateDocumentDialog implements OnInit, AfterViewInit {
  readonly dialogTitle   = input('Nuevo documento');
  readonly inputLabel    = input('Nombre del documento');
  readonly placeholder   = input('Ej: Mi investigación');
  readonly showTemplates = input(false);

  readonly confirm = output<CreateDocumentEvent>();
  readonly cancel  = output<void>();

  protected readonly universeService = inject(TypstUniverseService);
  protected readonly BLANK = BLANK;

  // ── Wizard ────────────────────────────────────────────────────────────────
  protected readonly step  = signal<'template' | 'name'>('template');
  protected readonly title = signal('');

  // ── Gallery ───────────────────────────────────────────────────────────────
  protected readonly universeTemplates   = signal<UniverseTemplate[]>([]);
  protected readonly universeLoading     = signal(false);
  protected readonly universeError       = signal(false);
  protected readonly universeSearch      = signal('');
  protected readonly selectedCategory    = signal('all');
  protected readonly selectedTemplate    = signal<UniverseTemplate | null>(null);
  protected readonly downloadingTemplate = signal(false);
  protected readonly downloadError       = signal(false);

  /** Top categories sorted by frequency across all templates. */
  protected readonly availableCategories = computed(() => {
    const counts = new Map<string, number>();
    for (const t of this.universeTemplates()) {
      for (const c of t.categories ?? []) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  });

  protected readonly filteredTemplates = computed(() => {
    const q   = this.universeSearch().toLowerCase().trim();
    const cat = this.selectedCategory();
    let list  = this.universeTemplates();
    if (cat !== 'all') list = list.filter((t) => t.categories?.includes(cat));
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.keywords?.some((k) => k.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  protected readonly canProceed = computed(() => this.selectedTemplate() !== null);

  /** Whether the blank card should be visible (hidden when searching or filtering). */
  protected readonly showBlankCard = computed(
    () => this.selectedCategory() === 'all' && !this.universeSearch().trim(),
  );

  protected readonly chipLabel = computed(() => {
    const t = this.selectedTemplate();
    if (!t) return '';
    return t.name === '__blank__' ? 'En blanco' : t.name;
  });
  protected readonly chipIcon = computed(() =>
    this.selectedTemplate()?.name === '__blank__' ? '📄' : '🌐',
  );

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private pendingFiles:  ProjectFile[]  = [{ name: 'main.typ', content: '' }];
  private pendingAssets: ProjectAsset[] = [];

  ngOnInit(): void {
    if (this.showTemplates()) this.loadUniverse();
  }

  ngAfterViewInit(): void {
    if (!this.showTemplates()) this.step.set('name');
    this.focusInput();
  }

  protected async loadUniverse(): Promise<void> {
    this.universeLoading.set(true);
    this.universeError.set(false);
    try {
      this.universeTemplates.set(await this.universeService.getTemplates());
    } catch {
      this.universeError.set(true);
    } finally {
      this.universeLoading.set(false);
    }
  }

  protected selectTemplate(t: UniverseTemplate): void {
    this.selectedTemplate.set(t);
  }

  protected selectCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  protected async nextStep(): Promise<void> {
    const t = this.selectedTemplate();
    if (!t) return;
    this.downloadError.set(false);

    if (t.name === '__blank__') {
      this.pendingFiles  = [{ name: 'main.typ', content: '' }];
      this.pendingAssets = [];
    } else {
      this.downloadingTemplate.set(true);
      try {
        const result      = await this.universeService.downloadTemplate(t);
        this.pendingFiles  = result.files;
        this.pendingAssets = result.assets;
      } catch {
        this.downloadError.set(true);
        this.downloadingTemplate.set(false);
        return;
      }
      this.downloadingTemplate.set(false);
    }

    this.step.set('name');
    setTimeout(() => this.focusInput());
  }

  protected back(): void {
    this.step.set('template');
  }

  protected submit(): void {
    const trimmed = this.title().trim();
    if (!trimmed) return;
    this.confirm.emit({ title: trimmed, files: this.pendingFiles, assets: this.pendingAssets });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submit();
    }
  }

  protected get modalTitle(): string {
    if (!this.showTemplates()) return this.dialogTitle();
    return this.step() === 'template' ? this.dialogTitle() : 'Nombrar documento';
  }

  protected get modalSize(): 'md' | 'lg' | 'xl' {
    if (!this.showTemplates()) return 'md';
    return this.step() === 'template' ? 'xl' : 'lg';
  }

  private focusInput(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
