import { NgClass } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ChevronLeft, FileText, LucideAngularModule, LucideIconData } from 'lucide-angular';

/** Shape of a single navigation entry displayed in the sidebar. */
interface NavItem {
  label: string;
  href: string;
  icon: LucideIconData;
}

/**
 * Collapsible application sidebar.
 *
 * Renders the brand wordmark, the main navigation links, and a collapse
 * toggle. Toggling `isCollapsed` shrinks the rail to icon-only width (64 px).
 */
@Component({
  selector: 'app-sidebar',
  imports: [LucideAngularModule, NgClass, RouterLink, RouterLinkActive],
  templateUrl: './app-sidebar.html',
  styleUrl: './app-sidebar.css',
})
export class AppSidebar {
  readonly ChevronLeft = ChevronLeft;

  /** Whether the sidebar is in narrow (icon-only) mode. */
  readonly isCollapsed = signal(false);

  /** Navigation items rendered in the main nav list. */
  readonly navItems: NavItem[] = [
    { label: 'Documents', href: '/app', icon: FileText },
  ];

  /** Toggles between expanded and collapsed sidebar states. */
  toggleSidebar(): void {
    this.isCollapsed.update((v) => !v);
  }
}
