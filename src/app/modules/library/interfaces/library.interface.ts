export type IngredientType = 'character' | 'location' | 'prop';

export interface Ingredient {
  id: string;
  type: IngredientType;
  name: string;
  description: string | null;
  metadata: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIngredientRequest {
  type?: IngredientType;
  name?: string;
  description?: string;
  metadata?: string;
}

export interface UpdateIngredientRequest extends CreateIngredientRequest {
  type?: IngredientType;
}

export interface IngredientFile {
  file_id: string;
  role: string | null;
  filename: string | null;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  category: string | null;
  format: string | null;
  /** Puede venir enriquecido desde GET /ingredients/:id/files. */
  size?: number | null;
  created_at?: string;
}

/** Respuesta de GET /ingredients: ingrediente + sus archivos vinculados. */
export interface IngredientWithFiles {
  ingredient: Ingredient;
  files: IngredientFile[];
}

export interface AddIngredientFileRequest {
  file_id: string;
  role?: string;
}

export interface FileIngredientRef {
  id: string;
  type: string;
  name: string;
}

export interface FileAsset {
  id: string;
  filename: string;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size: number | null;
  sha256: string | null;
  category: string | null;
  format: string | null;
  storage: string | null;
  trashed: boolean;
  duplicate?: boolean;
  /** IDs de los proyectos (eventos) a los que está asignado el recurso. */
  project_ids?: string[];
  /** Ingredientes (personaje/locación/prop) que referencian este recurso. */
  ingredients?: FileIngredientRef[];
  created_at: string;
  updated_at: string;
}

export interface FileListFilters {
  page?: number;
  pageSize?: number;
  category?: string;
  storage?: string;
  q?: string;
  /** Filtra solo recursos asignados a este proyecto (evento). */
  event_id?: string;
}

// ─── Secciones de la galería de referencias ────────────────

/**
 * Secciones de referencia (files.category): el Studio las usa para los
 * slots tipados y la galería/picker agrupan por ellas. Los valores son
 * libres en la BD; el resto ("images", "videos", "audios") cae en "Otros".
 */
export const ASSET_SECTIONS = [
  { key: 'character', label: 'Personaje' },
  { key: 'location', label: 'Ubicación' },
  { key: 'props', label: 'Utilería / Props' },
] as const;

export type AssetSectionKey = (typeof ASSET_SECTIONS)[number]['key'];

/** true si la categoría del recurso es una sección de referencia. */
export function isAssetSection(category: string | null | undefined): category is AssetSectionKey {
  return !!category && ASSET_SECTIONS.some((s) => s.key === category);
}

/** true si el recurso pertenece a la sección: por `category` o por alguno
    de sus ingredientes tipados (character/location/prop), igual que la
    galería de Admin → Imágenes distingue sus tipos. */
export function assetMatchesSection(
  asset: Pick<FileAsset, 'category' | 'ingredients'>,
  key: AssetSectionKey,
): boolean {
  if (asset.category === key) {
    return true;
  }
  return (asset.ingredients ?? []).some(
    (i) => i.type === key || (key === 'props' && i.type === 'prop'),
  );
}

export interface IngredientListFilters {
  page?: number;
  pageSize?: number;
  type?: IngredientType;
  q?: string;
}

export interface PresetGroup {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePresetGroupRequest {
  name?: string;
  description?: string;
}

export interface PresetContent {
  [key: string]: unknown;
}

export interface Preset {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  content: PresetContent | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePresetRequest {
  group_id?: string;
  name?: string;
  description?: string;
  content?: PresetContent;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillRequest {
  name?: string;
  description?: string;
  prompt?: string;
}

// ─── Elementos de la galería (diálogo "Editar elemento") ────────

/**
 * Estado del elemento que el diálogo "Editar elemento" guarda dentro de
 * `Ingredient.metadata` (JSONB). El back no conoce estos campos: sólo los
 * persiste como JSON, así que el front tolera metadata ausente o inválida.
 */
export interface ElementMetadata {
  /** ID con prefijo '@', p. ej. "@Mario". */
  element_id?: string;
  /** Versión libre, p. ej. "v1". */
  version?: string;
  /** Estado elegido en el select ('' = sin estado). */
  status?: string;
  /** Propiedades personalizadas clave → valor. */
  props?: Record<string, string>;
}

/** Parsea `Ingredient.metadata`; nunca lanza (degrada a {}). */
export function parseElementMetadata(raw: string | null | undefined): ElementMetadata {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ElementMetadata;
    }
  } catch {
    // Metadata corrupta o no-JSON: el editor arranca con valores por defecto.
  }
  return {};
}

/** Nombre por defecto del elemento: filename sin extensión y '_'/'-' → ' '. */
export function deriveElementName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Slug del elemento (sin '@'): el Nombre con separadores → '_'. */
export function deriveElementSlug(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_');
}

/** ID completo del elemento: '@' + slug ('' si el nombre quedó vacío). */
export function deriveElementId(name: string): string {
  const slug = deriveElementSlug(name);
  return slug ? `@${slug}` : '';
}
