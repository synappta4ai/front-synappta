/**
 * Fotos sugeridas del paso 1 de /agency y los tags `@imageN` con los que los
 * prompts las referencian.
 *
 * El contrato del experto (docs/agente-comercial.md, PASO 1) ya devuelve
 * `fotos_sugeridas` — qué imagen necesita cada escena, con qué prioridad y
 * para qué —; estas funciones la convierten en datos tipados y arman las
 * líneas que se leen en el paso 2 y que viajan al modelo de video.
 *
 * Sin dependencias de Angular: es la parte del flujo que se prueba sola.
 */

/** Foto subida al store: su file id es lo que se adjunta a la generación. */
export interface ReferenceImage {
  id: string;
  filename: string;
  url: string | null;
  /** Para qué sirve según el experto (producto, locacion, utileria…). */
  role?: string;
  /** Qué representa, en palabras del experto. */
  note?: string;
  /** Tipo elegido en el paso 1 (color del recurso en el prompt). */
  kind?: PhotoKind;
}

/** Prioridad del contrato `fotos_sugeridas`. */
export type PhotoPriority = 'imprescindible' | 'recomendada' | 'opcional';

/** Una imagen que el experto pide subir, con los archivos que el usuario ya
 *  cargó para esa necesidad (normalmente uno). */
export interface RequiredPhoto {
  /** Clave estable dentro del paso (`<prompt>-<índice>`). */
  id: string;
  /** Prompt del paso 1 al que sirve la imagen ('' = cualquiera). */
  promptId: string;
  /** Tipo del experto: personaje, producto, locacion, utileria, pose… */
  type: string;
  /** Qué imagen subir, en palabras simples. */
  description: string;
  /** Para qué sirve. */
  reason: string;
  priority: PhotoPriority;
  files: ReferenceImage[];
}

/** Una foto del paso 1 con el tag con el que su prompt la referencia. */
export interface TaggedPhoto {
  tag: string;
  file: ReferenceImage;
  photo: RequiredPhoto;
}

/** Tag de referencia dentro de un prompt: `@image1`, `@image2`… */
export function imageTag(index: number): string {
  return `@image${index + 1}`;
}

/** Tipo de una referencia visual subida por el usuario en el paso 1. */
export type PhotoKind = 'character' | 'product' | 'location' | 'props';

/** Tipos ofrecidos en el selector de cada foto (etiquetas i18n aparte). */
export const PHOTO_KINDS: readonly PhotoKind[] = ['character', 'location', 'props', 'product'];

/** Foto subida en el paso 1: archivo, tag `@nombre` y tipo elegido. */
export interface ProjectPhoto {
  /** File id del store: es lo que se adjunta a la generación. */
  id: string;
  filename: string;
  url: string | null;
  /** Tag que el usuario inserta en el prompt (`@ivan`). */
  tag: string;
  /** Tipo elegido por el usuario; null hasta que lo defina. */
  kind: PhotoKind | null;
}

/**
 * `Ivan.jpg` → `@ivan`. Sin acentos ni espacios y sin repetir un tag ya
 * usado (`@ivan`, `@ivan-2`, …): el tag viaja en el texto del prompt.
 */
export function tagFromFilename(filename: string, used: Iterable<string> = []): string {
  const base =
    filename
      .replace(/\.[^.]+$/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'foto';
  const taken = new Set([...used].map((tag) => tag.replace(/^@/, '')));
  let tag = base;
  let n = 2;
  while (taken.has(tag)) {
    tag = `${base}-${n}`;
    n += 1;
  }
  return `@${tag}`;
}

/** Tipo del experto (`fotos_sugeridas[].tipo`) → tipo de la foto subida. */
export function photoKindFromSuggestion(type: string): PhotoKind | null {
  switch (type.trim().toLowerCase()) {
    case 'personaje':
    case 'character':
      return 'character';
    case 'producto':
    case 'product':
      return 'product';
    case 'locacion':
    case 'ubicacion':
    case 'location':
    case 'lugar':
      return 'location';
    case 'utileria':
    case 'props':
    case 'prop':
      return 'props';
    default:
      return null;
  }
}

/** Tipo de la foto → `funcion` que espera `referencias_subidas` del experto. */
export function photoKindToFuncion(kind: PhotoKind): string {
  switch (kind) {
    case 'character':
      return 'personaje';
    case 'product':
      return 'producto';
    case 'location':
      return 'locacion';
    case 'props':
      return 'utileria';
  }
}

/** Tags `@nombre` presentes en el texto de un prompt (sin repetir, en
 *  minúsculas). Ignora un `@` pegado a una palabra (emails: `a@b`). */
export function parseTagsFromText(text: string): string[] {
  const pattern = /(^|[^\w@])@([a-z0-9][a-z0-9-]*)/gi;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tags.push(`@${match[2].toLowerCase()}`);
  }
  return [...new Set(tags)];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asPriority(raw: string): PhotoPriority {
  const value = raw.toLowerCase();
  return value === 'imprescindible' || value === 'recomendada' ? value : 'opcional';
}

/**
 * `fotos_sugeridas` del artefacto del paso 1 → lista tipada. Tolerante: una
 * entrada sin descripción no se puede pedir al usuario y se descarta; sin el
 * arreglo devuelve [] (el flujo sigue sin pedir nada).
 */
export function parseSuggestedPhotos(data: Record<string, unknown>): RequiredPhoto[] {
  const raw = Array.isArray(data['fotos_sugeridas']) ? data['fotos_sugeridas'] : [];
  const photos: RequiredPhoto[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const row = entry as Record<string, unknown>;
    const description = asText(row['descripcion']);
    if (!description) {
      return;
    }
    const promptId = asText(row['para_prompt']);
    photos.push({
      id: `${promptId || 'general'}-${index}`,
      promptId,
      type: asText(row['tipo']) || 'sin_definir',
      description,
      reason: asText(row['motivo']),
      priority: asPriority(asText(row['prioridad'])),
      files: [],
    });
  });
  return photos;
}

/** Imprescindibles sin archivo: bloquean el avance al paso 2. */
export function pendingRequiredPhotos(photos: RequiredPhoto[]): RequiredPhoto[] {
  return photos.filter((photo) => photo.priority === 'imprescindible' && photo.files.length === 0);
}

/** Cuántos archivos distintos hay cargados en total. */
export function photoFileCount(photos: RequiredPhoto[]): number {
  return new Set(photos.flatMap((photo) => photo.files.map((file) => file.id))).size;
}

/** Suma archivos a una sugerencia (sin repetir el mismo file id). */
export function addPhotoFiles(
  photos: RequiredPhoto[],
  photoId: string,
  assets: ReferenceImage[],
): RequiredPhoto[] {
  return photos.map((photo) => {
    if (photo.id !== photoId) {
      return photo;
    }
    const known = new Set(photo.files.map((file) => file.id));
    const added = assets.filter((asset) => asset.id && !known.has(asset.id));
    return added.length ? { ...photo, files: [...photo.files, ...added] } : photo;
  });
}

/** Quita un archivo de una sugerencia. */
export function removePhotoFile(
  photos: RequiredPhoto[],
  photoId: string,
  fileId: string,
): RequiredPhoto[] {
  return photos.map((photo) =>
    photo.id === photoId
      ? { ...photo, files: photo.files.filter((file) => file.id !== fileId) }
      : photo,
  );
}

function filesOfPrompt(photos: RequiredPhoto[], promptId: string): RequiredPhoto[] {
  return photos.filter((photo) => photo.promptId === promptId);
}

/**
 * Fotos de un prompt en orden de subida, numeradas desde `@image1`. El mismo
 * archivo en dos prompts se numera dentro de cada uno: el tag es simbólico
 * dentro de su prompt y el adjunto real va por file id.
 */
export function taggedPhotosForPrompt(
  photos: RequiredPhoto[],
  promptId: string,
): TaggedPhoto[] {
  const tagged: TaggedPhoto[] = [];
  for (const photo of filesOfPrompt(photos, promptId)) {
    for (const file of photo.files) {
      tagged.push({ tag: imageTag(tagged.length), file, photo });
    }
  }
  return tagged;
}

/** Qué se le pide al usuario para un prompt (las sugerencias sin archivo). */
export function missingPhotosForPrompt(
  photos: RequiredPhoto[],
  promptId: string,
): RequiredPhoto[] {
  return filesOfPrompt(photos, promptId).filter((photo) => photo.files.length === 0);
}

/** Todas las fotos cargadas de un prompt, sin repetir archivo. */
export function referenceImagesForPrompt(
  photos: RequiredPhoto[],
  promptId: string,
): ReferenceImage[] {
  const byId = new Map<string, ReferenceImage>();
  for (const tagged of taggedPhotosForPrompt(photos, promptId)) {
    if (!byId.has(tagged.file.id)) {
      byId.set(tagged.file.id, {
        ...tagged.file,
        role: tagged.photo.type,
        note: tagged.photo.description,
        kind: photoKindFromSuggestion(tagged.photo.type) ?? undefined,
      });
    }
  }
  return [...byId.values()];
}

/**
 * Líneas `@imageN` que se leen en el prompt: la hoja de storyboard ocupa
 * `@image1` cuando existe, igual que en el payload del experto y en el
 * `content` que se le manda al modelo de video.
 */
export function referenceTagLines(input: {
  board: boolean;
  references: ReferenceImage[];
}): string[] {
  const lines: string[] = [];
  let index = 0;
  if (input.board) {
    lines.push(
      `${imageTag(index)} (hoja de storyboard): respetar encuadres, iluminación y estilo de las viñetas.`,
    );
    index += 1;
  }
  for (const ref of input.references) {
    const role = [ref.role, ref.note].filter((part): part is string => !!part && part !== '').join(' — ');
    lines.push(
      `${imageTag(index)}${role ? ` (${role})` : ''}: respetar la apariencia real tal como en la imagen.`,
    );
    index += 1;
  }
  return lines;
}
