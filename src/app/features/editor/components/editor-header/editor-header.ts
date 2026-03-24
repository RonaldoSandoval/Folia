import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  ArrowLeft,
  Download,
  FileText,
  Image,
  LucideAngularModule,
  MessageSquare,
  PanelLeft,
  Save,
  Users,
} from 'lucide-angular';
import { AppHeader } from '../../../../layout/app/app-header/app-header';
import { Button } from '../../../../shared/components/button/button';
import { Dropdown, type DropdownItem } from '../../../../shared/components/dropdown/dropdown';
import type { PresenceUser } from '../../../../core/service/collaboration/supabase-yjs-provider';

export type DownloadFormat = 'pdf' | 'svg' | 'png';

@Component({
  selector: 'app-editor-header',
  imports: [AppHeader, Button, LucideAngularModule, Dropdown],
  templateUrl: './editor-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorHeader {
  protected readonly ArrowLeft     = ArrowLeft;
  protected readonly Save          = Save;
  protected readonly PanelLeft     = PanelLeft;
  protected readonly MessageSquare = MessageSquare;
  protected readonly Download      = Download;
  protected readonly Users         = Users;

  protected readonly downloadItems: DropdownItem[] = [
    { id: 'pdf', label: 'PDF',    icon: FileText },
    { id: 'svg', label: 'SVG',    icon: Image },
    { id: 'png', label: 'PNG',    icon: Image },
  ];

  documentId        = input<string>('');
  documentTitle     = input<string>('Sin título');
  filesOpen         = input<boolean>(false);
  chatOpen          = input<boolean>(false);
  sharingOpen       = input<boolean>(false);
  isCollaborative   = input<boolean>(false);
  presenceUsers     = input<PresenceUser[]>([]);
  compiling         = input<boolean>(false);
  saveStatus        = input<'guardado' | 'guardando' | 'sin-guardar'>('guardado');

  toggleFileClick   = output<void>();
  toggleChatClick   = output<void>();
  toggleSharingClick = output<void>();
  backClick         = output<void>();
  saveClick         = output<void>();
  downloadFormat    = output<DownloadFormat>();

  protected onDownloadItem(item: DropdownItem): void {
    this.downloadFormat.emit(item.id as DownloadFormat);
  }
}
