import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppHeader } from '../app-header/app-header';
import { AppShell } from '../app-shell/app-shell';
import { AppSidebar } from '../app-sidebar/app-sidebar';

/**
 * Authenticated application layout.
 *
 * Composes the three top-level layout pieces that form the main workspace:
 * - `AppSidebar`  — collapsible navigation rail
 * - `AppHeader`   — sticky top bar with user info
 * - `AppShell`    — main content area (documents list / router outlet)
 */
@Component({
  selector: 'app-layout',
  imports: [AppSidebar, AppHeader, AppShell],
  templateUrl: './app-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLayout {}
