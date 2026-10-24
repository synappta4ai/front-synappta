import { describe, expect, it } from 'vitest';

import { boardGrid, composeBoardSheetPrompt, referenceLabel } from './agency-storyboard-sheet';

describe('boardGrid', () => {
  it('reparte las viñetas en una cuadrícula apaisada', () => {
    expect(boardGrid(1)).toEqual({ columns: 1, rows: 1 });
    expect(boardGrid(3)).toEqual({ columns: 3, rows: 1 });
    expect(boardGrid(4)).toEqual({ columns: 2, rows: 2 });
    expect(boardGrid(6)).toEqual({ columns: 3, rows: 2 });
    expect(boardGrid(8)).toEqual({ columns: 4, rows: 2 });
    expect(boardGrid(12)).toEqual({ columns: 4, rows: 3 });
    expect(boardGrid(99)).toEqual({ columns: 4, rows: 3 });
  });
});

describe('referenceLabel', () => {
  it('etiqueta personaje, utilería y, por defecto, el lugar', () => {
    expect(referenceLabel('character')).toBe('CHARACTER');
    expect(referenceLabel('props')).toBe('PROP');
    expect(referenceLabel('product')).toBe('PROP');
    expect(referenceLabel('location')).toBe('LOCATION');
    expect(referenceLabel(undefined)).toBe('LOCATION');
  });
});

describe('composeBoardSheetPrompt', () => {
  const references = [
    { id: 'r1', filename: 'entrada.jpg', url: null },
    { id: 'r2', filename: 'lobby.jpg', url: null, kind: 'location' as const },
  ];

  it('inmobiliaria: fotos reales como verdad visual, cuadrícula exacta y hoja sin texto', () => {
    const prompt = composeBoardSheetPrompt({
      agent: 'real_estate',
      beats: 'Viñeta 1: plano general de la entrada.\nViñeta 2: lobby.',
      count: 4,
      ratio: '',
      references,
      descriptions: ['la entrada principal', 'el lobby de acceso'],
    });

    expect(prompt).toContain('real photographs or sales renders supplied by the developer');
    expect(prompt).toContain('Viñeta 1: plano general de la entrada.');
    expect(prompt).toContain('exactly 4 panels');
    expect(prompt).toContain('2 columns by 2 rows');
    expect(prompt).toContain('Panel 4 (Row 2, Column 2)');
    expect(prompt).not.toContain('Panel 5');
    expect(prompt).toContain('Reference 1 [LOCATION]: entrada.jpg — la entrada principal');
    expect(prompt).toContain('Reference 2 [LOCATION]: lobby.jpg — el lobby de acceso');
    expect(prompt).toContain('No text at all');
    expect(prompt).not.toContain('TIPO DE TOMA');
    expect(prompt).not.toContain('ruled');
  });

  it('cine: extrae ADN de personajes, locación y utilería', () => {
    const prompt = composeBoardSheetPrompt({
      agent: 'cinema',
      beats: 'Viñeta 1: ...',
      count: 3,
      ratio: '16:9',
      references: [{ id: 'c1', filename: 'ana.jpg', url: null, kind: 'character' }],
    });

    expect(prompt).toContain('[CHAR_REF]');
    expect(prompt).toContain('[PROP_REF]');
    expect(prompt).toContain('aspect ratio 16:9');
    expect(prompt).toContain('Reference 1 [CHARACTER]: ana.jpg');
    expect(prompt).not.toContain('supplied by the developer');
  });

  it('sin referencias lo dice en el manifiesto', () => {
    const prompt = composeBoardSheetPrompt({
      agent: 'real_estate',
      beats: 'Viñeta 1: x',
      count: 1,
      ratio: '',
      references: [],
    });
    expect(prompt).toContain('No reference images');
  });
});
