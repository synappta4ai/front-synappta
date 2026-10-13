import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Único punto que toca HttpClient en el módulo tools. Hoy solo lee los
 * system prompts por defecto desde /assets (texto plano, sin ApiResponse);
 * si Herramientas suma endpoints del back, se agregan aquí.
 */
@Injectable({ providedIn: 'root' })
export class ToolsApiRepository {
  private readonly http = inject(HttpClient);

  getSystemPrompt(assetPath: string): Observable<string> {
    return this.http.get(assetPath, { responseType: 'text' });
  }
}
