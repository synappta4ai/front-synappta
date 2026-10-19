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
 * back (GET /models): Nano Banana Pro (acepta referencias). La API es
 * intercambiable por tenant vía credenciales.
 */
export const POSE_SHEET_MODEL_NAMES: readonly string[] = ['gemini-3-pro-image-preview'];

/** Tríptico horizontal (frente / perfil / cuerpo entero). */
export const POSE_SHEET_RATIO = '3:2';

/** Anchor de proyecto/pieza para los logs del back (idempotente por código). */
export const POSE_SHEET_PIECE_CODE = 'TOOLS-POSE-SHEET';

/** Vista de cámara de la locación: 8 presets (la elevada de esquina es el default). */
export type LocationView =
  | 'elevated-corner'
  | 'right'
  | 'left'
  | 'drone'
  | 'top'
  | 'back'
  | 'front-right-45'
  | 'front-left-45';

export interface LocationViewDef {
  key: LocationView;
  labelKey: string;
  /** Instrucción que se anexa al prompt (clave i18n). */
  instructionKey: string;
}

export const LOCATION_VIEWS: readonly LocationViewDef[] = [
  {
    key: 'elevated-corner',
    labelKey: 'TOOLS.VIEW_ELEVATED_CORNER',
    instructionKey: 'TOOLS.VIEW_ELEVATED_CORNER_PROMPT',
  },
  { key: 'right', labelKey: 'TOOLS.VIEW_RIGHT', instructionKey: 'TOOLS.VIEW_RIGHT_PROMPT' },
  { key: 'left', labelKey: 'TOOLS.VIEW_LEFT', instructionKey: 'TOOLS.VIEW_LEFT_PROMPT' },
  { key: 'drone', labelKey: 'TOOLS.VIEW_DRONE', instructionKey: 'TOOLS.VIEW_DRONE_PROMPT' },
  { key: 'top', labelKey: 'TOOLS.VIEW_TOP', instructionKey: 'TOOLS.VIEW_TOP_PROMPT' },
  { key: 'back', labelKey: 'TOOLS.VIEW_BACK', instructionKey: 'TOOLS.VIEW_BACK_PROMPT' },
  {
    key: 'front-right-45',
    labelKey: 'TOOLS.VIEW_FRONT_RIGHT_45',
    instructionKey: 'TOOLS.VIEW_FRONT_RIGHT_45_PROMPT',
  },
  {
    key: 'front-left-45',
    labelKey: 'TOOLS.VIEW_FRONT_LEFT_45',
    instructionKey: 'TOOLS.VIEW_FRONT_LEFT_45_PROMPT',
  },
];

/** Vista por defecto: elevada desde la esquina superior (la mejor para fijar la locación como ingrediente de video). */
export const LOCATION_DEFAULT_VIEW: LocationView = 'elevated-corner';

/**
 * Modelos ofrecidos en Locación. Nano Banana Pro acepta las imágenes
 * subidas para recrear vistas desde otros ángulos.
 */
export const LOCATION_MODEL_NAMES: readonly string[] = ['gemini-3-pro-image-preview'];

/** Opción de relación de aspecto para el desplegable (w/h dibujan el swatch). */
export interface LocationRatioOption {
  value: string;
  w: number;
  h: number;
}

/**
 * Relaciones de aspecto posibles en Locación. El desplegable muestra solo las
 * que declare el modelo elegido; este catálogo aporta el rótulo y el recuadro
 * proporcional.
 */
export const LOCATION_RATIO_OPTIONS: readonly LocationRatioOption[] = [
  { value: '16:9', w: 16, h: 9 },
  { value: '21:9', w: 21, h: 9 },
  { value: '3:2', w: 3, h: 2 },
  { value: '4:3', w: 4, h: 3 },
  { value: '5:4', w: 5, h: 4 },
  { value: '1:1', w: 1, h: 1 },
  { value: '4:5', w: 4, h: 5 },
  { value: '3:4', w: 3, h: 4 },
  { value: '2:3', w: 2, h: 3 },
  { value: '9:16', w: 9, h: 16 },
];

/** Relación por defecto (horizontal de video); si el modelo no la soporta, se cae a la más ancha disponible. */
export const LOCATION_DEFAULT_RATIO = '16:9';

/** Resolución por defecto. */
export const LOCATION_DEFAULT_RESOLUTION = '2K';

/** Resoluciones de respaldo si el modelo no declara las suyas. */
export const LOCATION_RESOLUTIONS_FALLBACK: readonly string[] = ['1K', '2K', '4K'];

/**
 * Preferencia al elegir resolución por defecto: gana la primera soportada por
 * el modelo (2K es el objetivo; si no existe, la mejor disponible).
 */
export const LOCATION_RESOLUTION_PREFERENCE: readonly string[] = [
  '2K',
  '4K',
  '1080p',
  '1K',
  '720p',
  '480p',
];

/** Anchor de proyecto/pieza para los logs del back (idempotente por código). */
export const LOCATION_PIECE_CODE = 'TOOLS-LOCATION';

/** System prompt por defecto de la locación (servido en /assets). */
export const LOCATION_SYSTEM_ASSET = './assets/tools/location.system.md';

/** Animación de carga compartida por las herramientas (servida en /assets). */
export const TOOLS_LOADING_VIDEO = './assets/tools/animation.mp4';
export const TOOLS_LOADING_POSTER = './assets/tools/carga-poster.jpeg';
