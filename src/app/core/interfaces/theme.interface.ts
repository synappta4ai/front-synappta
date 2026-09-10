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
