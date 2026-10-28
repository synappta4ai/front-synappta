import { Pipe, PipeTransform } from '@angular/core';

/** Unidades binarias para tamaños de archivo y pesos de modelo. */
const BYTES_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formatea bytes en la unidad binaria legible más cercana (B → TB).
 * Valores inválidos o no positivos devuelven '—'.
 */
export function formatBytesValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < BYTES_UNITS.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const decimals = Number.isInteger(amount) ? 0 : amount >= 10 || unit === 0 ? 0 : 1;
  return `${amount.toFixed(decimals)} ${BYTES_UNITS[unit]}`;
}

@Pipe({ name: 'formatBytes' })
export class FormatBytesPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatBytesValue(value);
  }
}
