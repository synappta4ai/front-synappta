export interface DayGroup<T> {
  /** Clave estable AAAA-MM-DD en hora local. */
  key: string;
  /** Medianoche local del día. */
  date: Date;
  items: T[];
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Agrupa elementos por día local (más reciente primero). Dentro de cada día
 * conserva el orden recibido. Las fechas inválidas se ignoran.
 */
export function groupByDay<T>(items: readonly T[], getDate: (item: T) => string): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const d = new Date(getDate(item));
    if (Number.isNaN(d.getTime())) {
      continue;
    }
    const key = dayKey(d);
    let group = groups.get(key);
    if (!group) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Días de calendario entre `day` y `today` (0 = hoy, 1 = ayer). */
export function daysAgo(day: Date, today: Date): number {
  const a = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}
