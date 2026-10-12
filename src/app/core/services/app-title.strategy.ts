import { Title } from '@angular/platform-browser';
import { Injectable, Injector, inject } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

/** Traduce el `<title>` del documento: las rutas exponen la key i18n en
 *  `route.title` (`APP.ROUTES.*`) y este strategy la resuelve en el idioma
 *  activo. `get()` además re-emite al cambiar de idioma para refrescar el
 *  título sin navegar.
 *
 *  `TranslateService` se resuelve de forma perezosa vía `Injector`: inyectarlo
 *  directo crea un ciclo `Router → TitleStrategy → TranslateService → HttpClient
 *  → interceptors → Router`. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private pending: Subscription | null = null;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.pending?.unsubscribe();
    this.pending = null;
    const key = this.buildTitle(snapshot);
    if (key === undefined) return;
    const translate = this.injector.get(TranslateService);
    this.title.setTitle(translate.instant(key));
    this.pending = translate.get(key).subscribe((text) => this.title.setTitle(text));
  }
}
