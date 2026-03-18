import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideAiService } from './core/service/ai/ai.service';
import { provideDocumentService } from './core/service/document/document.service';
import { provideAuthService } from './core/service/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAuthService(),
    provideDocumentService(),
    provideAiService(),
  ],
};
