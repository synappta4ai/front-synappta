import { bootstrapApplication } from '@angular/platform-browser';
import { ErrorHandler } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { App } from './app/app.component';
import { appConfig } from './app/app.config';

Sentry.init({
  dsn: 'https://b14dff5afbdb4b0b9bf605ee9bb5f414@glitchtip.synappta.cloud/1',
  tracesSampleRate: 0.01,
  autoSessionTracking: false,
});

bootstrapApplication(App, {
  ...appConfig,
  providers: [
    ...appConfig.providers,
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
  ],
}).catch((err) => console.error(err));
