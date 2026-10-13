/** Variante de hoja de poses: cada una tiene su system prompt por defecto. */
export type PoseSheetVariant = 'body' | 'expressions';

export interface PoseSheetVariantDef {
  key: PoseSheetVariant;
  /** Ruta del asset con el system prompt por defecto (servido en /assets). */
  asset: string;
  labelKey: string;
  descriptionKey: string;
}

export const POSE_SHEET_VARIANTS: readonly PoseSheetVariantDef[] = [
  {
    key: 'body',
    asset: './assets/tools/pose-sheet-body.system.md',
    labelKey: 'TOOLS.VARIANT_BODY',
    descriptionKey: 'TOOLS.VARIANT_BODY_DESC',
  },
  {
    key: 'expressions',
    asset: './assets/tools/pose-sheet-expressions.system.md',
    labelKey: 'TOOLS.VARIANT_EXPRESSIONS',
    descriptionKey: 'TOOLS.VARIANT_EXPRESSIONS_DESC',
  },
];

/**
 * Modelos ofrecidos en la Hoja de poses. Nombres exactos del catálogo del
 * back (GET /models): Soul 2 (texto puro) y Nano Banana Pro (acepta
 * referencias). La API es intercambiable por tenant vía credenciales.
 */
export const POSE_SHEET_MODEL_NAMES: readonly string[] = [
  'higgsfield-soul-2-standard',
  'gemini-3-pro-image-preview',
];

/** Tríptico horizontal (frente / perfil / cuerpo entero). */
export const POSE_SHEET_RATIO = '3:2';

/** Anchor de proyecto/pieza para los logs del back (idempotente por código). */
export const POSE_SHEET_PIECE_CODE = 'TOOLS-POSE-SHEET';
