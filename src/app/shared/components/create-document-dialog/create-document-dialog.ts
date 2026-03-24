import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from '../button/button';
import { Modal } from '../modal/modal';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '../../../core/templates/document-templates';
import type { ProjectFile } from '../../../core/service/document/document.service';
import {
  TypstUniverseService,
  type UniverseTemplate,
} from '../../../core/service/typst-universe/typst-universe.service';

export interface CreateDocumentEvent {
  title: string;
  files: ProjectFile[];
}

@Component({
  selector: 'app-create-document-dialog',
  imports: [Modal, Button],
  templateUrl: './create-document-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateDocumentDialog implements AfterViewInit {
  readonly dialogTitle = input('Nuevo documento');
  readonly inputLabel  = input('Nombre del documento');
  readonly placeholder = input('Ej: Mi investigación');

  /** When true, shows the template picker before the title step. */
  readonly showTemplates = input(false);

  readonly confirm = output<CreateDocumentEvent>();
  readonly cancel  = output<void>();

  protected readonly universeService = inject(TypstUniverseService);
  protected readonly templates       = DOCUMENT_TEMPLATES;

  // ── Wizard state ───────────────────────────────────────────────────────────

  protected readonly step            = signal<'template' | 'name'>('template');
  protected readonly selectedTemplate = signal<DocumentTemplate>(DOCUMENT_TEMPLATES[0]);
  protected readonly title           = signal('');

  // ── Universe state ─────────────────────────────────────────────────────────

  protected readonly activeTab                = signal<'basic' | 'universe'>('basic');
  protected readonly universeTemplates        = signal<UniverseTemplate[]>([]);
  protected readonly universeLoading          = signal(false);
  protected readonly universeError            = signal(false);
  protected readonly universeSearch           = signal('');
  protected readonly selectedUniverseTemplate = signal<UniverseTemplate | null>(null);
  protected readonly downloadingTemplate      = signal(false);
  protected readonly downloadError            = signal(false);

  protected readonly filteredUniverseTemplates = computed(() => {
    const q   = this.universeSearch().toLowerCase().trim();
    const all = this.universeTemplates();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  });

  // Chip shown in step 2 reflecting the template chosen in step 1.
  protected readonly chipLabel = computed(() =>
    this.activeTab() === 'universe'
      ? (this.selectedUniverseTemplate()?.name ?? '')
      : this.selectedTemplate().name,
  );
  protected readonly chipIcon = computed(() =>
    this.activeTab() === 'universe' ? '🌐' : this.selectedTemplate().icon,
  );

  // "Siguiente" is disabled when Universe tab is active but nothing is selected.
  protected readonly canProceed = computed(
    () => this.activeTab() === 'basic' || this.selectedUniverseTemplate() !== null,
  );

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  /** Files to load into the new document; set by nextStep() before moving to step 2. */
  private pendingFiles: ProjectFile[] = [{ name: 'main.typ', content: '' }];

  ngAfterViewInit(): void {
    if (!this.showTemplates()) {
      this.step.set('name');
    }
    this.focusInput();
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  protected switchTab(tab: 'basic' | 'universe'): void {
    this.activeTab.set(tab);
    if (tab === 'universe' && this.universeTemplates().length === 0 && !this.universeLoading()) {
      this.loadUniverse();
    }
  }

  protected async loadUniverse(): Promise<void> {
    this.universeLoading.set(true);
    this.universeError.set(false);
    try {
      const templates = await this.universeService.getTemplates();
      this.universeTemplates.set(templates);
    } catch {
      this.universeError.set(true);
    } finally {
      this.universeLoading.set(false);
    }
  }

  // ── Template selection ─────────────────────────────────────────────────────

  protected selectTemplate(template: DocumentTemplate): void {
    this.selectedTemplate.set(template);
  }

  protected selectUniverseTemplate(template: UniverseTemplate): void {
    this.selectedUniverseTemplate.set(template);
  }

  // ── Wizard navigation ──────────────────────────────────────────────────────

  protected async nextStep(): Promise<void> {
    this.downloadError.set(false);

    if (this.activeTab() === 'universe') {
      const t = this.selectedUniverseTemplate();
      if (!t) return;

      this.downloadingTemplate.set(true);
      try {
        this.pendingFiles = await this.universeService.downloadTemplate(t);
      } catch {
        this.downloadError.set(true);
        this.downloadingTemplate.set(false);
        return;
      }
      this.downloadingTemplate.set(false);
    } else {
      this.pendingFiles = this.selectedTemplate().files;
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
    this.confirm.emit({ title: trimmed, files: this.pendingFiles });
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
    return this.step() === 'template' && this.activeTab() === 'universe' ? 'xl' : 'lg';
  }

  private focusInput(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
