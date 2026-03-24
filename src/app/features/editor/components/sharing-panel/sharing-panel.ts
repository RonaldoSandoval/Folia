import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  Check,
  LucideAngularModule,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-angular';
import {
  CollaborationService,
  type Collaborator,
  type CollaboratorRole,
  type ProfileResult,
} from '../../../../core/service/collaboration/collaboration.service';
import { ToastService } from '../../../../core/service/toast/toast.service';
import { Spinner } from '../../../../shared/components/spinner/spinner';

@Component({
  selector: 'app-sharing-panel',
  imports: [LucideAngularModule, Spinner],
  templateUrl: './sharing-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
})
export class SharingPanel {
  private readonly collaboration = inject(CollaborationService);
  private readonly toast         = inject(ToastService);

  protected readonly Search    = Search;
  protected readonly UserPlus  = UserPlus;
  protected readonly UserCheck = UserCheck;
  protected readonly Trash2    = Trash2;
  protected readonly Check     = Check;
  protected readonly X         = X;

  // ── Inputs / Outputs ────────────────────────────────────────────────────────

  readonly documentId   = input.required<string>();
  readonly collaborators = input<Collaborator[]>([]);
  readonly isOwner      = input<boolean>(false);
  readonly close        = output<void>();

  // ── Search state ────────────────────────────────────────────────────────────

  protected readonly searchQuery   = signal('');
  protected readonly searchResults = signal<ProfileResult[]>([]);
  protected readonly isSearching   = signal(false);

  // ── Action state ────────────────────────────────────────────────────────────

  protected readonly addingUserId    = signal<string | null>(null);
  protected readonly removingUserId  = signal<string | null>(null);
  protected readonly updatingUserId  = signal<string | null>(null);

  // ── Search ──────────────────────────────────────────────────────────────────

  async onSearchInput(value: string): Promise<void> {
    this.searchQuery.set(value);
    if (value.trim().length < 2) {
      this.searchResults.set([]);
      return;
    }
    this.isSearching.set(true);
    const results = await this.collaboration.searchProfiles(value);
    const existingIds = new Set(this.collaborators().map((c) => c.userId));
    this.searchResults.set(results.filter((r) => !existingIds.has(r.id)));
    this.isSearching.set(false);
  }

  // ── Add collaborator ────────────────────────────────────────────────────────

  async addUser(userId: string, role: CollaboratorRole): Promise<void> {
    this.addingUserId.set(userId);
    try {
      await this.collaboration.addCollaborator(this.documentId(), userId, role);
      this.searchResults.update((rs) => rs.filter((r) => r.id !== userId));
      this.searchQuery.set('');
      this.toast.success('Colaborador añadido.');
    } catch {
      this.toast.error('No se pudo añadir al colaborador.');
    } finally {
      this.addingUserId.set(null);
    }
  }

  // ── Update role ─────────────────────────────────────────────────────────────

  async changeRole(userId: string, role: CollaboratorRole): Promise<void> {
    this.updatingUserId.set(userId);
    try {
      await this.collaboration.updateRole(this.documentId(), userId, role);
      this.toast.success('Rol actualizado.');
    } catch {
      this.toast.error('No se pudo actualizar el rol.');
    } finally {
      this.updatingUserId.set(null);
    }
  }

  // ── Remove collaborator ─────────────────────────────────────────────────────

  async removeUser(userId: string): Promise<void> {
    this.removingUserId.set(userId);
    try {
      await this.collaboration.removeCollaborator(this.documentId(), userId);
      this.toast.info('Colaborador eliminado.');
    } catch {
      this.toast.error('No se pudo eliminar al colaborador.');
    } finally {
      this.removingUserId.set(null);
    }
  }

  protected roleLabel(role: CollaboratorRole): string {
    return role === 'editor' ? 'Editor' : role === 'admin' ? 'Admin' : 'Lector';
  }
}
