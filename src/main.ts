import { bootstrapApplication } from '@angular/platform-browser';
import { initializeFaro } from '@grafana/faro-web-sdk';
import { App } from './app/app';
import { appConfig } from './app/app.config';

initializeFaro({
  url: 'http://localhost:4318/collect',
  app: {
    name: 'synapta-front',
    version: '1.0.0',
    environment: 'development',
  },
});

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
