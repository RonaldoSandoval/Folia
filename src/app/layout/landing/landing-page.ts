import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { ArrowRight, LucideAngularModule } from 'lucide-angular';
import { Button } from '../../shared/components/button/button';

/**
 * Public landing page.
 *
 * Shows the Typs brand hero and a primary CTA that takes the user to the
 * main application. In the future the CTA will redirect to the login page.
 */
@Component({
  selector: 'app-landing-page',
  imports: [Button, LucideAngularModule],
  templateUrl: './landing-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  readonly ArrowRight = ArrowRight;

  constructor(private readonly router: Router) {}

  goToApp(): void {
    this.router.navigate(['/login']);
  }
}
