import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  ArrowLeft,
  Download,
  LucideAngularModule,
  MessageSquare,
  PanelLeft,
  Save,
} from 'lucide-angular';
import { AppHeader } from '../../../../layout/app/app-header/app-header';
import { Button } from '../../../../shared/components/button/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-editor-header',
  imports: [AppHeader, Button, LucideAngularModule, CommonModule],
  templateUrl: './editor-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorHeader {
  readonly ArrowLeft     = ArrowLeft;
  readonly Save          = Save;
  readonly PanelLeft     = PanelLeft;
  readonly MessageSquare = MessageSquare;
  readonly Download      = Download;

  documentId    = input<string>('');
  documentTitle = input<string>('Sin título');
  filesOpen     = input<boolean>(false);
  chatOpen      = input<boolean>(false);
  compiling     = input<boolean>(false);
  saveStatus    = input<'guardado' | 'guardando' | 'sin-guardar'>('guardado');

  toggleFileClick = output<void>();
  toggleChatClick = output<void>();
  backClick       = output<void>();
  saveClick       = output<void>();
  downloadClick   = output<void>();
}
