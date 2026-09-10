import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ColorPalette,
  ThemeMode,
  ThemeConfig,
  UserThemePreference,
  COLOR_PALETTES,
} from '../interfaces/theme.interface';
import { environment } from '@env/environment';
import { Observable, of, tap, catchError, map } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  // Signals para el estado del tema
  readonly currentPalette = signal<ColorPalette>('violet');
  readonly currentMode = signal<ThemeMode>('dark');
  readonly isLoading = signal<boolean>(false);

  // API endpoint dinámico
  private get API_URL(): string {
    return `${environment.apiUrl}/user/preferences/theme`;
  }

  constructor() {
    // Efecto para aplicar cambios de tema automáticamente
    effect(() => {
      this.applyTheme(this.currentPalette(), this.currentMode());
    });

    // Cargar tema al inicializar
    this.loadTheme();
  }

  /**
   * Carga el tema guardado (desde backend o localStorage como fallback)
   */
  private loadTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.isLoading.set(true);

    // Intentar cargar desde el backend primero
    this.http
      .get<UserThemePreference>(this.API_URL)
      .pipe(
        tap((preference) => {
          this.currentPalette.set(preference.theme.palette);
          this.currentMode.set(preference.theme.mode);
          this.saveToLocalStorage(preference.theme);
        }),
        catchError((error) => {
          // Si falla el backend, intentar cargar desde localStorage
          const savedTheme = this.loadFromLocalStorage();
          if (savedTheme) {
            this.currentPalette.set(savedTheme.palette);
            this.currentMode.set(savedTheme.mode);
          }
          return of(null);
        }),
        tap(() => this.isLoading.set(false)),
      )
      .subscribe();
  }

  /**
   * Cambia la paleta de colores
   */
  setPalette(palette: ColorPalette): void {
    this.currentPalette.set(palette);
    this.saveTheme();
  }

  /**
   * Cambia el modo (claro/oscuro)
   */
  setMode(mode: ThemeMode): void {
    this.currentMode.set(mode);
    this.saveTheme();
  }

  /**
   * Alterna entre modo claro y oscuro
   */
  toggleMode(): void {
    const newMode = this.currentMode() === 'light' ? 'dark' : 'light';
    this.setMode(newMode);
  }

  /**
   * Obtiene la configuración actual del tema
   */
  getCurrentTheme(): ThemeConfig {
    return {
      palette: this.currentPalette(),
      mode: this.currentMode(),
    };
  }

  /**
   * Aplica el tema al documento
   */
  private applyTheme(palette: ColorPalette, mode: ThemeMode): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const root = document.documentElement;

    // Aplicar modo oscuro
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Aplicar paleta de colores
    this.applyColorPalette(palette);
  }

  /**
   * Aplica la paleta de colores a las variables CSS
   */
  private applyColorPalette(palette: ColorPalette): void {
    const root = document.documentElement;

    // Mapeo de tonalidades
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    shades.forEach((shade) => {
      const value = getComputedStyle(root).getPropertyValue(`--${palette}-${shade}`);
      root.style.setProperty(`--primary-${shade}`, value);
    });
  }

  /**
   * Guarda el tema en el backend y localStorage
   */
  private saveTheme(): void {
    const theme = this.getCurrentTheme();

    // Guardar en localStorage como fallback
    this.saveToLocalStorage(theme);

    // Intentar guardar en backend
    this.http
      .post<UserThemePreference>(this.API_URL, { theme })
      .pipe(
        catchError((error) => {
          console.warn('No se pudo guardar el tema en el backend:', error);
          return of(null);
        }),
      )
      .subscribe();
  }

  /**
   * Guarda en localStorage
   */
  private saveToLocalStorage(theme: ThemeConfig): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem('aura-pos-theme', JSON.stringify(theme));
  }

  /**
   * Carga desde localStorage
   */
  private loadFromLocalStorage(): ThemeConfig | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const saved = localStorage.getItem('aura-pos-theme');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error al parsear tema guardado:', e);
      }
    }
    return null;
  }

  /**
   * Obtiene las paletas disponibles
   */
  getAvailablePalettes() {
    return COLOR_PALETTES;
  }

  /**
   * Sincroniza el tema con el backend (útil al iniciar sesión)
   */
  syncThemeWithBackend(): Observable<ThemeConfig | null> {
    return this.http.get<UserThemePreference>(this.API_URL).pipe(
      tap((preference) => {
        this.currentPalette.set(preference.theme.palette);
        this.currentMode.set(preference.theme.mode);
        this.saveToLocalStorage(preference.theme);
      }),
      map((preference) => preference?.theme || null),
      catchError((error) => {
        console.warn('No se pudo sincronizar el tema:', error);
        return of(null);
      }),
    );
  }
}
