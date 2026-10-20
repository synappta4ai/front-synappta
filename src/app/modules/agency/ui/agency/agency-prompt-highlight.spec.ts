import type { PhotoKind } from './agency-photos';
import { highlightPrompt, PromptSlotSpan } from './agency-prompt-highlight';

const kinds = new Map<string, PhotoKind | null>([
  ['@ivan', 'character'],
  ['@marta', 'character'],
  ['@casa', 'location'],
  ['@auto', 'props'],
  ['@aceite', 'product'],
  ['@sin-tipo', null],
]);

const slots: PromptSlotSpan[] = [
  { value: '(aquí debe ir una foto: cocina cálida)', tone: 'location' },
  { value: '@casa', tone: 'location' },
];

describe('highlightPrompt', () => {
  it('sin texto devuelve una lista vacía', () => {
    expect(highlightPrompt('', slots, kinds)).toEqual([]);
  });

  it('deja el texto sin tags ni slots como plano', () => {
    expect(highlightPrompt('Un plano general del amanecer.', slots, kinds)).toEqual([
      { text: 'Un plano general del amanecer.', tone: 'plain' },
    ]);
  });

  it('pinta el slot de locación y los tags según su tipo', () => {
    const text = 'La (aquí debe ir una foto: cocina cálida) recibe a @ivan con @auto.';

    expect(highlightPrompt(text, slots, kinds)).toEqual([
      { text: 'La ', tone: 'plain' },
      { text: '(aquí debe ir una foto: cocina cálida)', tone: 'location' },
      { text: ' recibe a ', tone: 'plain' },
      { text: '@ivan', tone: 'character' },
      { text: ' con ', tone: 'plain' },
      { text: '@auto', tone: 'props' },
      { text: '.', tone: 'plain' },
    ]);
  });

  it('tolera mayúsculas y tags sin foto conocida', () => {
    expect(highlightPrompt('@Ivan mira a @Nadie.', [], kinds)).toEqual([
      { text: '@Ivan', tone: 'character' },
      { text: ' mira a ', tone: 'plain' },
      { text: '@Nadie', tone: 'unknown' },
      { text: '.', tone: 'plain' },
    ]);
  });

  it('un tag sin tipo asignado queda como desconocido', () => {
    expect(highlightPrompt('Entra @sin-tipo.', [], kinds)).toEqual([
      { text: 'Entra ', tone: 'plain' },
      { text: '@sin-tipo', tone: 'unknown' },
      { text: '.', tone: 'plain' },
    ]);
  });

  it('los tags posicionales sin tipo quedan planos, no como error', () => {
    expect(highlightPrompt('Usa @image1 y @image2.', [], kinds)).toEqual([
      { text: 'Usa @image1 y @image2.', tone: 'plain' },
    ]);
  });

  it('no confunde el @ de un email con un tag', () => {
    expect(highlightPrompt('Escribir a ventas@ivan.com', [], kinds)).toEqual([
      { text: 'Escribir a ventas@ivan.com', tone: 'plain' },
    ]);
  });

  it('un tag que coincide con el slot conserva el tono del slot', () => {
    expect(highlightPrompt('La @casa al atardecer.', slots, kinds)).toEqual([
      { text: 'La ', tone: 'plain' },
      { text: '@casa', tone: 'location' },
      { text: ' al atardecer.', tone: 'plain' },
    ]);
  });
});
