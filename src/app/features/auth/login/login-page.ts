import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Mail, Lock, LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../core/service/auth/auth.service';
import { Button } from '../../../shared/components/button/button';
import { TextField } from '../../../shared/components/text-field/text-field';

type Mode = 'login' | 'signup';
type SignupState = 'idle' | 'confirm';

@Component({
  selector: 'app-login-page',
  imports: [Button, TextField, LucideAngularModule],
  templateUrl: './login-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);

  protected readonly Mail = Mail;
  protected readonly Lock = Lock;

  protected readonly mode = signal<Mode>('login');
  protected readonly signupState = signal<SignupState>('idle');

  protected readonly email = signal('');
  protected readonly password = signal('');

  protected toggleMode(): void {
    this.mode.update((m) => (m === 'login' ? 'signup' : 'login'));
    this.auth.clearError();
    this.signupState.set('idle');
  }

  protected async submit(): Promise<void> {
    if (this.mode() === 'login') {
      await this.auth.signIn(this.email(), this.password());
    } else {
      await this.auth.signUp(this.email(), this.password());
      if (!this.auth.error()) {
        this.signupState.set('confirm');
      }
    }
  }
}
