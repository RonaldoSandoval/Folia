import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    // Register the Service Worker that pre-caches .wasm assets and serves them
    // with the correct Content-Type: application/wasm on every subsequent visit.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
  })
  .catch((err) => console.error(err));
