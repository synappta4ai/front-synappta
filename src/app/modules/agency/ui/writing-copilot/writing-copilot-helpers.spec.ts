import {
  buildReferences,
  parsePromptHeader,
  promptKinds,
  splitFences,
  splitPromptText,
  tagAssets,
} from './writing-copilot-helpers';

describe('writing copilot helpers', () => {
  it('separa prosa y bloques de codigo en orden', () => {
    const segments = splitFences(
      'Intro\n\n```\nPROMPT 1\n```\n\nmedio\n\n```txt\nPROMPT 2\n```\nfin',
    );
    expect(segments.map((s) => s.code)).toEqual([false, true, false, true, false]);
    expect(segments[0].content).toBe('Intro');
    expect(segments[1].content).toBe('PROMPT 1');
    expect(segments[2].content).toBe('medio');
    expect(segments[3].content).toBe('PROMPT 2');
    expect(segments[4].content).toBe('fin');
  });

  it('ignora bloques vacios y vallas sin contenido', () => {
    const segments = splitFences('texto\n```\n\n```\nmas texto');
    expect(segments.every((s) => s.content.length > 0)).toBe(true);
    expect(segments.some((s) => s.code)).toBe(false);
  });

  it('devuelve solo prosa cuando no hay bloques', () => {
    const segments = splitFences('  una idea suelta  ');
    expect(segments).toEqual([{ code: false, content: 'una idea suelta' }]);
  });

  it('devuelve vacio con texto vacio', () => {
    expect(splitFences('')).toEqual([]);
    expect(splitFences('   ')).toEqual([]);
  });
});

describe('writing copilot assets', () => {
  const assets = [
    { id: 'a', name: 'modelo.jpg', kind: 'image' as const, role: 'person' as const, url: '' },
    { id: 'b', name: 'cadena.jpg', kind: 'image' as const, role: 'product' as const, url: '' },
    { id: 'c', name: 'calle.mp4', kind: 'video' as const, role: 'product' as const, url: '' },
    { id: 'd', name: 'track.mp3', kind: 'audio' as const, role: 'product' as const, url: '' },
    { id: 'e', name: 'bar.jpg', kind: 'image' as const, role: 'environment' as const, url: '' },
  ];

  it('etiqueta con el nombre del archivo', () => {
    const tagged = tagAssets(assets);
    expect(tagged.map((a) => a.tag)).toEqual([
      '@modelo.jpg',
      '@cadena.jpg',
      '@calle.mp4',
      '@track.mp3',
      '@bar.jpg',
    ]);
  });

  it('agrega sufijo cuando dos archivos se llaman igual', () => {
    const tagged = tagAssets([
      { id: '1', name: 'foto.png', kind: 'image', role: 'product', url: '' },
      { id: '2', name: 'foto.png', kind: 'image', role: 'person', url: '' },
    ]);
    expect(tagged.map((a) => a.tag)).toEqual(['@foto.png', '@foto-2.png']);
  });

  it('arma el manifiesto con el rol y el nombre del archivo', () => {
    const refs = buildReferences(tagAssets(assets));
    expect(refs).toContain('@modelo.jpg = identity reference: the on-screen person "modelo.jpg"');
    expect(refs).toContain('@cadena.jpg = product: the user\'s product "cadena.jpg"');
    expect(refs).toContain('@bar.jpg = environment reference: location and lighting "bar.jpg"');
    expect(refs).toContain('@calle.mp4 = reference video clip "calle.mp4"');
    expect(refs).toContain('@track.mp3 = audio reference "track.mp3"');
  });

  it('mapea cada insumo a su tono de resaltado', () => {
    const kinds = promptKinds(tagAssets(assets));
    expect(kinds.get('@modelo.jpg')).toBe('character');
    expect(kinds.get('@cadena.jpg')).toBe('product');
    expect(kinds.get('@bar.jpg')).toBe('location');
    expect(kinds.get('@calle.mp4')).toBe('video');
    expect(kinds.get('@track.mp3')).toBe('audio');
  });

  it('usa la actuaci\u00f3n como t\u00edtulo del prompt', () => {
    const block = [
      'PROMPT 01 de 10 | 4 s | MEDIUM SHOT TO CLOSE-UP',
      'BLOQUE DE CONTINUIDAD: porche de la casa.',
      'Actuaci\u00f3n: Objetivo: encender la vela. @Mam\u00e1 sostiene la llama con la mano.',
    ].join('\n');
    const header = parsePromptHeader(block, 1);
    expect(header.number).toBe(1);
    expect(header.title).toBe('ENCENDER LA VELA');
  });

  it('traduce la actuaci\u00f3n en ingl\u00e9s', () => {
    const block = [
      'PROMPT 02 de 10 | 4 s | MACRO INSERT',
      'Acting: Objective: to shelter the flame. @Pap\u00e1 shields the candle.',
    ].join('\n');
    expect(parsePromptHeader(block, 2).title).toBe('TO SHELTER THE FLAME');
  });

  it('prioriza la l\u00ednea T\u00cdTULO del skill', () => {
    const block = [
      'PROMPT 03 de 10 | 4 s | MACRO INSERT',
      'T\u00cdTULO: La ni\u00f1a enciende la vela',
      'Actuaci\u00f3n: enciende la vela.',
    ].join('\n');
    expect(parsePromptHeader(block, 3).title).toBe('LA NI\u00d1A ENCIENDE LA VELA');
  });

  it('parte el prompt final por encabezados PROMPT', () => {
    const text = [
      'PROMPT 01 de 02 | 4 s | MEDIUM SHOT',
      'Actuaci\u00f3n: enciende la vela.',
      '',
      'PROMPT 02 de 02 | 4 s | MACRO INSERT',
      'Acting: to blow the candle.',
    ].join('\n');
    const blocks = splitPromptText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].number).toBe(1);
    expect(blocks[0].title).toBe('ENCIENDE LA VELA');
    expect(blocks[1].title).toBe('TO BLOW THE CANDLE');
  });
});
