import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

export type AppLang = 'es' | 'en';

/** Clave de localStorage donde se persiste el idioma elegido. */
const LANG_STORAGE_KEY = 'app-lang';

/**
 * Idioma de la aplicación: estado + persistencia. Única fuente de verdad
 * para el toggle de idioma (theme-panel y layout público).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Idioma activo (señal reactiva de ngx-translate). */
  readonly currentLang = this.translate.currentLang;

  /** Restaura el idioma persistido (llamado una vez al arrancar la app). */
  init(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'es' || stored === 'en') {
      this.translate.use(stored).subscribe();
    }
  }

  /** Cambia el idioma activo y lo persiste para próximas visitas. */
  setLang(lang: AppLang): void {
    this.translate.use(lang).subscribe();
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
  }
}
