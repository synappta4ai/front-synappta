import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { authInterceptor } from '@interceptors/auth.interceptor';

import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';
import { AppStore, UserSessionStore } from './core/store';
import { GenerationEventsStore } from './core/store/generation.events';
import { AgencyService } from '@modules/agency/services';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities',
          },
        },
      },
    }),
    provideTranslateService({
      lang: 'es',
      fallbackLang: 'es',
    }),
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json',
    }),
    provideAppInitializer(async () => {
      // All inject() calls stay synchronous: after the first await the
      // injection context is gone (NG0203) and the call would throw.
      const sessionStore = inject(UserSessionStore);
      const appStore = inject(AppStore);
      const agencyService = inject(AgencyService);
      const eventsStore = inject(GenerationEventsStore);
      await sessionStore.init();
      await appStore.init();

      // Take-reel hydration: restore recent generations after a reload so the
      // studio queue/reel survive F5. Skipped for anonymous sessions — no
      // useless API calls (or bootstrap delay) on the public pages.
      if (!sessionStore.isLoggedIn()) {
        return;
      }
      try {
        const models = await firstValueFrom(agencyService.listModels());
        eventsStore.applyCatalog(
          models.map((m) => ({
            name: m.name,
            displayName: m.display_name || m.name,
            type:
              (m as { type?: string }).type === 'downloaded'
                ? ('downloaded' as const)
                : ('api' as const),
          })),
        );
        eventsStore.hydrate();
      } catch {
        // Offline or not authenticated: the reel simply starts empty.
      }
    }),
  ],
};
