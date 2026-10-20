import {
  beatAction,
  planScenePrompt,
  ScenePromptArtifact,
  slotKindForPhoto,
  slotRangeForKind,
} from './agency-scene-prompt';

/** Prompt del PASO 1 comercial tal como lo devuelve el artefacto del back. */
const artifact: ScenePromptArtifact = {
  id: 'P1',
  titulo: 'La cocina de la abuela',
  resumen_para_usuario: 'El padre y el hijo cocinan juntos.',
  mensaje_marca: 'Cocinar es volver a casa.',
  locacion: 'cocina cálida, isla de madera y ventana al jardín',
  personajes: ['padre, cabello castaño, delantal azul', 'hijo, 8 años, remera roja'],
  producto_en_escena: 'botella de aceite de oliva en el centro de la isla',
  modo: 'M1',
  registro: 'comercial',
  beats: [
    {
      momento: 1,
      verbo: 'resistir',
      accion_fisica: 'se aferra al marco de la puerta',
      microgesto: 'mirada rápida a la esquina y vuelve',
      dialogo: 'ninguno — toma muda',
      importancia: 'alta',
    },
    { momento: 2, verbo: 'servir', accion_fisica: 'llena el plato', dialogo: '¿listo?' },
  ],
};

describe('beatAction', () => {
  it('junta verbo, acción física y microgesto', () => {
    expect(beatAction(artifact.beats![0])).toBe(
      'resistir — se aferra al marco de la puerta (mirada rápida a la esquina y vuelve)',
    );
  });

  it('sin microgesto no deja paréntesis vacío', () => {
    expect(beatAction({ verbo: 'servir', accion_fisica: 'llena el plato' })).toBe(
      'servir — llena el plato',
    );
    expect(beatAction({})).toBe('');
  });
});

describe('planScenePrompt', () => {
  it('arma el plan con locación, personajes, producto y beats', () => {
    const plan = planScenePrompt(artifact)!;

    expect(plan.title).toBe('La cocina de la abuela');
    expect(plan.location).toEqual({
      kind: 'location',
      description: 'cocina cálida, isla de madera y ventana al jardín',
    });
    expect(plan.characters.map((c) => c.kind)).toEqual(['character', 'character']);
    expect(plan.characters).toHaveLength(2);
    expect(plan.product?.kind).toBe('product');
    expect(plan.beats).toEqual([
      {
        action: 'resistir — se aferra al marco de la puerta (mirada rápida a la esquina y vuelve)',
        dialogue: 'ninguno — toma muda',
      },
      { action: 'servir — llena el plato', dialogue: '¿listo?' },
    ]);
    expect(plan.camera).toEqual({ mode: 'M1', registro: 'comercial' });
    expect(plan.marca).toBe('Cocinar es volver a casa.');
  });

  it('descarta locación y producto "ninguno" y tolera basura', () => {
    const plan = planScenePrompt({
      locacion: 'ninguna',
      producto_en_escena: 'ninguno',
      personajes: ['padre', '  ', 7 as unknown as string],
      beats: [{ verbo: '' }, { microgesto: 'solo gesto' }],
    })!;

    expect(plan.location).toBeNull();
    expect(plan.product).toBeNull();
    expect(plan.characters.map((c) => c.description)).toEqual(['padre']);
    expect(plan.beats).toEqual([{ action: '(solo gesto)', dialogue: '' }]);
  });

  it('sin artefacto devuelve null', () => {
    expect(planScenePrompt(null)).toBeNull();
    expect(planScenePrompt(undefined)).toBeNull();
  });
});

describe('slotKindForPhoto', () => {
  it('mapea personaje, locación y producto; props no tiene slot', () => {
    expect(slotKindForPhoto('character')).toBe('character');
    expect(slotKindForPhoto('location')).toBe('location');
    expect(slotKindForPhoto('product')).toBe('product');
    expect(slotKindForPhoto('props')).toBeNull();
    expect(slotKindForPhoto(null)).toBeNull();
  });
});

describe('slotRangeForKind', () => {
  const slots = [
    { kind: 'location' as const, value: '(aquí debe ir una foto: cocina)' },
    { kind: 'character' as const, value: '(aquí debe ir una foto: Iván)' },
    { kind: 'character' as const, value: '@marta' },
    { kind: 'product' as const, value: '(aquí debe ir una foto: aceite)' },
  ];

  it('usa el primer placeholder libre del tipo pedido', () => {
    const text =
      'La (aquí debe ir una foto: cocina) recibe a (aquí debe ir una foto: Iván) y @marta.';
    const range = slotRangeForKind(text, 'character', slots)!;

    expect(text.slice(range.start, range.end)).toBe('(aquí debe ir una foto: Iván)');
  });

  it('respeta el slot bajo el cursor', () => {
    const text =
      'La (aquí debe ir una foto: cocina) recibe a (aquí debe ir una foto: Iván) y @marta.';
    const caret = text.indexOf('cocina');
    const range = slotRangeForKind(text, 'location', slots, caret)!;

    expect(text.slice(range.start, range.end)).toBe('(aquí debe ir una foto: cocina)');
  });

  it('si el cursor está en otro tipo, busca el primer libre del tipo pedido', () => {
    const text =
      'La (aquí debe ir una foto: cocina) recibe a @marta con (aquí debe ir una foto: aceite).';
    const caret = text.indexOf('cocina');
    const range = slotRangeForKind(text, 'product', slots, caret)!;

    expect(text.slice(range.start, range.end)).toBe('(aquí debe ir una foto: aceite)');
  });

  it('prefiere un placeholder libre aunque haya un tag antes en el texto', () => {
    const text = '@marta entra a (aquí debe ir una foto: Iván).';
    const range = slotRangeForKind(text, 'character', slots)!;

    expect(text.slice(range.start, range.end)).toBe('(aquí debe ir una foto: Iván)');
  });

  it('reasigna cuando todos los slots del tipo ya tienen tag', () => {
    const text = 'La (aquí debe ir una foto: cocina) recibe a @marta.';
    const range = slotRangeForKind(text, 'character', slots)!;

    expect(text.slice(range.start, range.end)).toBe('@marta');
  });

  it('props o tipo desconocido no tienen rango', () => {
    expect(slotRangeForKind('texto', 'props', slots)).toBeNull();
    expect(slotRangeForKind('texto', null, slots)).toBeNull();
  });
});
