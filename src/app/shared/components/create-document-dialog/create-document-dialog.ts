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

  readonly confirm = output<string>();
  readonly cancel  = output<void>();

  readonly title = signal('');

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  ngAfterViewInit(): void {
    this.inputRef()?.nativeElement.focus();
  }

  submit(): void {
    const trimmed = this.title().trim();
    if (!trimmed) return;
    this.confirm.emit(trimmed);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submit();
    }
  }
}
