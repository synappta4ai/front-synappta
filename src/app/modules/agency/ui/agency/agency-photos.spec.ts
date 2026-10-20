import {
  addPhotoFiles,
  imageTag,
  missingPhotosForPrompt,
  parseSuggestedPhotos,
  parseTagsFromText,
  pendingRequiredPhotos,
  photoFileCount,
  photoKindFromSuggestion,
  photoKindToFuncion,
  referenceImagesForPrompt,
  referenceTagLines,
  removePhotoFile,
  RequiredPhoto,
  tagFromFilename,
  taggedPhotosForPrompt,
} from './agency-photos';

/** Salida del PASO 1 comercial tal como la devuelve el artefacto del back. */
const artifact: Record<string, unknown> = {
  paso: 1,
  estado: 'ok',
  prompts: [
    { id: 'P1', titulo: 'La cocina de la abuela' },
    { id: 'P2', titulo: 'La calle a las 7' },
  ],
  fotos_sugeridas: [
    {
      para_prompt: 'P1',
      tipo: 'locacion',
      descripcion: 'Foto de la cocina, con la isla y la ventana',
      motivo: 'La escena ocurre ahí y define la luz',
      prioridad: 'imprescindible',
    },
    {
      para_prompt: 'P2',
      tipo: 'locacion',
      descripcion: 'Foto de la calle a la altura de la vereda',
      motivo: 'Marca el tráfico y el clima de la escena',
      prioridad: 'imprescindible',
    },
    {
      para_prompt: 'P1',
      tipo: 'producto',
      descripcion: 'Envase del producto, de frente y bien iluminado',
      motivo: 'El envase no se puede inventar',
      prioridad: 'recomendada',
    },
  ],
};

function photo(overrides: Partial<RequiredPhoto>): RequiredPhoto {
  return {
    id: 'p',
    promptId: 'P1',
    type: 'locacion',
    description: 'descripción',
    reason: '',
    priority: 'imprescindible',
    files: [],
    ...overrides,
  };
}

describe('parseSuggestedPhotos', () => {
  it('convierte fotos_sugeridas en la lista tipada del paso 1', () => {
    const photos = parseSuggestedPhotos(artifact);

    expect(photos.map((p) => [p.promptId, p.type, p.priority])).toEqual([
      ['P1', 'locacion', 'imprescindible'],
      ['P2', 'locacion', 'imprescindible'],
      ['P1', 'producto', 'recomendada'],
    ]);
    expect(photos.every((p) => p.files.length === 0)).toBe(true);
    expect(new Set(photos.map((p) => p.id)).size).toBe(3);
  });

  it('tolera basura: sin arreglo, sin descripción y entradas que no son objetos', () => {
    expect(parseSuggestedPhotos({})).toEqual([]);
    expect(parseSuggestedPhotos({ fotos_sugeridas: 'nada' })).toEqual([]);
    expect(
      parseSuggestedPhotos({ fotos_sugeridas: [null, 7, { tipo: 'producto' }, { descripcion: '  ' }] }),
    ).toEqual([]);
  });

  it('normaliza la prioridad desconocida a opcional y el tipo ausente a sin_definir', () => {
    const [row] = parseSuggestedPhotos({
      fotos_sugeridas: [{ descripcion: 'Una foto', prioridad: 'urgentísima' }],
    });

    expect(row.priority).toBe('opcional');
    expect(row.type).toBe('sin_definir');
    expect(row.promptId).toBe('');
  });
});

describe('gate del paso 1', () => {
  it('solo las imprescindibles sin archivo bloquean el avance', () => {
    const uploaded = [photo({ id: 'a', files: [{ id: 'f1', filename: 'a.jpg', url: null }] })];
    const photos = [
      ...uploaded,
      photo({ id: 'b', priority: 'recomendada' }),
      photo({ id: 'c', priority: 'imprescindible' }),
    ];

    expect(pendingRequiredPhotos(photos).map((p) => p.id)).toEqual(['c']);
    expect(pendingRequiredPhotos([...photos.map((p) => ({ ...p, files: uploaded[0].files }))])).toEqual(
      [],
    );
  });
});

describe('archivos por sugerencia', () => {
  it('suma sin repetir el mismo archivo y quita por file id', () => {
    const photos = [photo({ id: 'a' })];
    const withFiles = addPhotoFiles(photos, 'a', [
      { id: 'f1', filename: 'cocina.jpg', url: null },
      { id: 'f2', filename: 'isla.jpg', url: null },
    ]);
    const again = addPhotoFiles(withFiles, 'a', [
      { id: 'f1', filename: 'cocina.jpg', url: null },
      { id: 'f3', filename: 'ventana.jpg', url: null },
    ]);

    expect(again[0].files.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
    expect(photoFileCount(again)).toBe(3);
    expect(removePhotoFile(again, 'a', 'f2')[0].files.map((f) => f.id)).toEqual(['f1', 'f3']);
    // Otra sugerencia no se toca.
    expect(addPhotoFiles(again, 'otra', [{ id: 'f9', filename: 'x.jpg', url: null }])).toEqual(again);
  });
});

describe('tags por prompt', () => {
  const photos = [
    photo({
      id: 'p1-loc',
      promptId: 'P1',
      type: 'locacion',
      description: 'Foto de la cocina',
      files: [{ id: 'f1', filename: 'cocina.jpg', url: null }],
    }),
    photo({
      id: 'p1-prod',
      promptId: 'P1',
      type: 'producto',
      description: 'Envase de frente',
      priority: 'recomendada',
      files: [{ id: 'f2', filename: 'envase.jpg', url: null }],
    }),
    photo({
      id: 'p2-loc',
      promptId: 'P2',
      files: [{ id: 'f3', filename: 'calle.jpg', url: null }],
    }),
  ];

  it('numera desde @image1 dentro de cada prompt y en orden de subida', () => {
    expect(taggedPhotosForPrompt(photos, 'P1').map((t) => [t.tag, t.file.id])).toEqual([
      ['@image1', 'f1'],
      ['@image2', 'f2'],
    ]);
    expect(taggedPhotosForPrompt(photos, 'P2').map((t) => t.tag)).toEqual(['@image1']);
    expect(taggedPhotosForPrompt(photos, 'P9')).toEqual([]);
    expect(imageTag(0)).toBe('@image1');
  });

  it('arma las referencias de la escena con el rol y la descripción del experto', () => {
    expect(referenceImagesForPrompt(photos, 'P1')).toEqual([
      {
        id: 'f1',
        filename: 'cocina.jpg',
        url: null,
        role: 'locacion',
        note: 'Foto de la cocina',
        kind: 'location',
      },
      {
        id: 'f2',
        filename: 'envase.jpg',
        url: null,
        role: 'producto',
        note: 'Envase de frente',
        kind: 'product',
      },
    ]);
  });

  it('lista qué falta pedir por prompt', () => {
    expect(missingPhotosForPrompt(photos, 'P1')).toEqual([]);
    expect(missingPhotosForPrompt([photo({ id: 'x', promptId: 'P3' })], 'P3').map((p) => p.id)).toEqual([
      'x',
    ]);
  });
});

describe('tags de las fotos subidas', () => {
  it('arma el tag desde el nombre del archivo, sin extensión ni acentos', () => {
    expect(tagFromFilename('Ivan.jpg')).toBe('@ivan');
    expect(tagFromFilename('Papá en la tienda.PNG')).toBe('@papa-en-la-tienda');
    expect(tagFromFilename('  .jpg')).toBe('@foto');
  });

  it('evita repetir un tag ya usado', () => {
    expect(tagFromFilename('ivan.jpg', ['@ivan'])).toBe('@ivan-2');
    expect(tagFromFilename('ivan.jpg', ['@ivan', '@ivan-2'])).toBe('@ivan-3');
  });

  it('mapea el tipo del experto y el tipo de la foto a la función del contrato', () => {
    expect(photoKindFromSuggestion('personaje')).toBe('character');
    expect(photoKindFromSuggestion('producto')).toBe('product');
    expect(photoKindFromSuggestion('locacion')).toBe('location');
    expect(photoKindFromSuggestion('utileria')).toBe('props');
    expect(photoKindFromSuggestion('pose')).toBeNull();
    expect(photoKindToFuncion('character')).toBe('personaje');
    expect(photoKindToFuncion('product')).toBe('producto');
    expect(photoKindToFuncion('location')).toBe('locacion');
    expect(photoKindToFuncion('props')).toBe('utileria');
  });
});

describe('parseTagsFromText', () => {
  it('extrae los tags @nombre del prompt, sin repetir y en minúsculas', () => {
    expect(parseTagsFromText('Locación: @papa en @tienda, con @Tienda otra vez')).toEqual([
      '@papa',
      '@tienda',
    ]);
  });

  it('sin tags devuelve una lista vacía y no corta el texto a mitad', () => {
    expect(parseTagsFromText('Una escena sin referencias.')).toEqual([]);
    expect(parseTagsFromText('mail@dominio.com no es un tag válido')).toEqual([]);
  });
});

describe('referenceTagLines', () => {
  it('sin storyboard la primera foto es @image1', () => {
    expect(
      referenceTagLines({
        board: false,
        references: [
          { id: 'f1', filename: 'cocina.jpg', url: null, role: 'locacion', note: 'Foto de la cocina' },
          { id: 'f2', filename: 'envase.jpg', url: null },
        ],
      }),
    ).toEqual([
      '@image1 (locacion — Foto de la cocina): respetar la apariencia real tal como en la imagen.',
      '@image2: respetar la apariencia real tal como en la imagen.',
    ]);
  });

  it('con storyboard la hoja toma @image1 y las fotos corren desde @image2', () => {
    const lines = referenceTagLines({
      board: true,
      references: [{ id: 'f1', filename: 'fachada.jpg', url: null, role: 'locacion' }],
    });

    expect(lines[0]).toContain('@image1 (hoja de storyboard)');
    expect(lines[1]).toContain('@image2 (locacion)');
  });

  it('sin nada que referenciar no inventa líneas', () => {
    expect(referenceTagLines({ board: false, references: [] })).toEqual([]);
  });
});
