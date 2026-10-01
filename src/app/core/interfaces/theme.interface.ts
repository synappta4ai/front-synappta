export type ColorPalette = 'base' | 'yellow' | 'green' | 'blue' | 'orange' | 'red' | 'violet';
export type ThemeMode = 'light' | 'dark';

export interface ThemeConfig {
  palette: ColorPalette;
  mode: ThemeMode;
}

export interface UserThemePreference {
  userId: string;
  theme: ThemeConfig;
  updatedAt: Date;
}

export const COLOR_PALETTES: { id: ColorPalette; name: string; color: string }[] = [
  { id: 'base', name: 'Base', color: '#ef4444' },
  { id: 'yellow', name: 'Yellow', color: '#eab308' },
  { id: 'green', name: 'Green', color: '#22c55e' },
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'orange', name: 'Orange', color: '#f97316' },
  { id: 'red', name: 'Red', color: '#ef4444' },
  { id: 'violet', name: 'Violet', color: '#8b5cf6' },
];

/**
 * Acentos disponibles en el panel de configuración. Se aplican como
 * override en runtime sobre --color-accent/hover/active, por lo que
 * alcanzan a Tailwind (bg-accent…) y a los tokens --p-* de PrimeNG.
 * Contraste on-accent (#0F0F0F) verificado: lima 17.1, amarillo 10.5,
 * azul 7.3, rosa 7.9 (hover/active ≥4.9 en todos).
 */
export type AccentId = 'lime' | 'yellow' | 'blue' | 'pink';

export interface AccentDef {
  id: AccentId;
  name: string;
  accent: string;
  hover: string;
  active: string;
}

export const ACCENTS: { id: AccentId; name: string; color: string }[] = [
  { id: 'lime', name: 'Lima', color: '#e7fe64' },
  { id: 'yellow', name: 'Amarillo', color: '#ffb100' },
  { id: 'blue', name: 'Azul', color: '#3ca5fa' },
  { id: 'pink', name: 'Rosa', color: '#ff76c8' },
];

const ACCENT_SHADES: Record<AccentId, { hover: string; active: string }> = {
  lime: { hover: '#d4eb50', active: '#c3da42' },
  yellow: { hover: '#eda400', active: '#db9600' },
  blue: { hover: '#2a94ec', active: '#1d84db' },
  pink: { hover: '#f061b8', active: '#dd50a9' },
};

export function accentDef(id: AccentId): AccentDef {
  const base = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
  const shades = ACCENT_SHADES[base.id];
  return { id: base.id, name: base.name, accent: base.color, ...shades };
}

export function isAccentId(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}
