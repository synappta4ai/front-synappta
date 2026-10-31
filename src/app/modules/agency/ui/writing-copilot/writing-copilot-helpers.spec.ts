import { buildReferences, promptKinds, splitFences, tagAssets } from './writing-copilot-helpers';

describe('writing copilot helpers', () => {
  it('separa prosa y bloques de codigo en orden', () => {
    const segments = splitFences('Intro\n\n```\nPROMPT 1\n```\n\nmedio\n\n```txt\nPROMPT 2\n```\nfin');
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

  it('asigna una etiqueta por tipo en el orden de carga', () => {
    const tagged = tagAssets(assets);
    expect(tagged.map((a) => a.tag)).toEqual(['@Image1', '@Image2', '@Video1', '@Audio1', '@Image3']);
  });

  it('arma el manifiesto con el rol y el nombre del archivo', () => {
    const refs = buildReferences(tagAssets(assets));
    expect(refs).toContain('@Image1 = identity reference: the on-screen person "modelo.jpg"');
    expect(refs).toContain("@Image2 = product: the user's product \"cadena.jpg\"");
    expect(refs).toContain('@Image3 = environment reference: location and lighting "bar.jpg"');
    expect(refs).toContain('@Video1 = reference video clip "calle.mp4"');
    expect(refs).toContain('@Audio1 = audio reference "track.mp3"');
  });

  it('mapea solo las imagenes para el resaltado', () => {
    const kinds = promptKinds(tagAssets(assets));
    expect(kinds.get('@image1')).toBe('character');
    expect(kinds.get('@image2')).toBe('product');
    expect(kinds.get('@image3')).toBe('location');
    expect(kinds.has('@video1')).toBe(false);
    expect(kinds.has('@audio1')).toBe(false);
  });
});