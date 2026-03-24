import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from '../button/button';
import { Modal } from '../modal/modal';
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from '../../../core/templates/document-templates';
import type { ProjectFile } from '../../../core/service/document/document.service';

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

  protected readonly templates = DOCUMENT_TEMPLATES;

  protected readonly step              = signal<'template' | 'name'>('template');
  protected readonly selectedTemplate  = signal<DocumentTemplate>(DOCUMENT_TEMPLATES[0]);
  protected readonly title             = signal('');

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  ngAfterViewInit(): void {
    // If templates are hidden, skip straight to the name step and focus input.
    if (!this.showTemplates()) {
      this.step.set('name');
    }
    this.focusInput();
  }

  protected selectTemplate(template: DocumentTemplate): void {
    this.selectedTemplate.set(template);
  }

  protected nextStep(): void {
    this.step.set('name');
    // Focus runs after the view updates on the next tick.
    setTimeout(() => this.focusInput());
  }

  protected back(): void {
    this.step.set('template');
  }

  protected submit(): void {
    const trimmed = this.title().trim();
    if (!trimmed) return;
    this.confirm.emit({ title: trimmed, files: this.selectedTemplate().files });
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

  private focusInput(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
