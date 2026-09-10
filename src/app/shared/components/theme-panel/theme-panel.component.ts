import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '@services/theme.service';
import { ColorPalette, ThemeMode, COLOR_PALETTES } from '@interfaces/theme.interface';

@Component({
  selector: 'app-theme-panel',
  imports: [CommonModule],
  templateUrl: './theme-panel.component.html',
  styleUrls: ['./theme-panel.component.css'],
})
export class ThemePanelComponent {
  private themeService = inject(ThemeService);

  // Exponer signals para el template
  readonly currentPalette = this.themeService.currentPalette;
  readonly currentMode = this.themeService.currentMode;

  // Paletas disponibles
  readonly palettes = COLOR_PALETTES;

  /**
   * Cambia la paleta de colores
   */
  onPaletteChange(palette: ColorPalette): void {
    this.themeService.setPalette(palette);
  }

  /**
   * Cambia el modo (claro/oscuro)
   */
  onModeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  onLogout() {
    // TODO: implementar con las rutas de auth
    // this.router.navigate([AUTH.ROOT, AUTH.LOGOUT]);
  }

  onDownloadOffline() {
    // TODO: implementar CommonService
    // this.commonService.downloadOffLineApi();
  }
}
