import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, RouteReuseStrategy, type ActivatedRouteSnapshot, type DetachedRouteHandle } from '@angular/router';

import { routes } from './app.routes';
import { provideAiService } from './core/service/ai/ai.service';
import { provideAiConfig } from './core/service/ai/ai-model-registry';
import { provideDocumentService } from './core/service/document/document.service';
import { provideAuthService } from './core/service/auth/auth.service';
import { provideCollaborationService } from './core/service/collaboration/collaboration.service';
import { environment } from '../environments/environment';

/**
 * Custom route reuse strategy that prevents Angular from reusing the same
 * component instance when navigating between routes with different params
 * (e.g., /project/id1 → /project/id2).
 *
 * Without this, Angular reuses EditorPage across different document IDs,
 * causing ngOnDestroy/ngOnInit to be skipped — breaking auto-save, Yjs
 * teardown, and document initialization for the new document.
 */
class ParamAwareReuseStrategy implements RouteReuseStrategy {
  shouldDetach(): boolean { return false; }
  store(): void {}
  shouldAttach(): boolean { return false; }
  retrieve(): DetachedRouteHandle | null { return null; }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig !== curr.routeConfig) return false;
    // If the route has a dynamic :id segment, only reuse when the id is identical.
    if (future.params['id'] !== undefined) {
      return future.params['id'] === curr.params['id'];
    }
    return true;
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: RouteReuseStrategy, useClass: ParamAwareReuseStrategy },
    provideAuthService(),
    provideDocumentService(),
    // ── AI ─────────────────────────────────────────────────────────────────
    // Production: traffic routed through Supabase Edge Function (keys as secrets).
    // Development: direct API call with local key for testing without a deploy.
    provideAiConfig('llama-3.3-70b-versatile',
      environment.production
        ? { proxyUrl: `${environment.supabaseUrl}/functions/v1/ai-chat` }
        : { apiKey: environment.groqApiKey },
    ),
    provideAiService(),
    // ───────────────────────────────────────────────────────────────────────
    provideCollaborationService(),
  ],
};
