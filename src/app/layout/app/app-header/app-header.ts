import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideAngularModule, Moon, Sun } from 'lucide-angular';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { AuthService } from '../../../core/service/auth/auth.service';
import { ThemeService } from '../../../core/service/theme/theme-service';

@Component({
  selector: 'app-header',
  imports: [LucideAngularModule, Avatar],
  templateUrl: './app-header.html',
  styleUrl: './app-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeader {
  protected readonly theme = inject(ThemeService);
  protected readonly auth  = inject(AuthService);

  readonly Moon = Moon;
  readonly Sun  = Sun;

  /** Display name: full_name from metadata, or the part before @ in the email. */
  protected readonly userName = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    return (user.user_metadata?.['full_name'] as string | undefined)
      ?? user.email?.split('@')[0]
      ?? '';
  });

  /** Subtitle shown inside the avatar dropdown. */
  protected readonly userEmail = computed(() => this.auth.user()?.email ?? '');
}
