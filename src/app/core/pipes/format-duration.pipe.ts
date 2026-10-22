import { Pipe, PipeTransform } from '@angular/core';

export type DurationUnit = 's' | 'ms';

/**
 * Formatea duraciones compactas (`45s`, `2.5s`, `3m 12s`, `1h 5m`).
 * La rama `ms` conserva el sufijo de milisegundos bajo el segundo (`850ms`).
 * Valores inválidos o no positivos devuelven '—'.
 */
export function formatDurationValue(
  value: number | null | undefined,
  unit: DurationUnit = 's',
): string {
  if (value == null) return '—';
  if (unit === 'ms') {
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value < 1000) return `${Math.round(value)}ms`;
    return formatDurationValue(value / 1000, 's');
  }
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 60) return Number.isInteger(value) ? `${value}s` : `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value - minutes * 60);
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes - hours * 60}m`;
}

@Pipe({ name: 'formatDuration' })
export class FormatDurationPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: DurationUnit = 's'): string {
    return formatDurationValue(value, unit);
  }
}
