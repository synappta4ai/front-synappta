/** Fuente de un clip: el back la resuelve a un archivo local del servidor. */
export interface EditorSource {
  /** Archivo de la biblioteca (files.id). */
  file_id?: string;
  /** Salida generada servida bajo /outputs/ (ruta relativa al servidor). */
  output?: string;
}

export type EditorTrackKind = 'video' | 'audio' | 'text';

/** Pista del timeline. `kind` fija qué clips acepta; las pistas de un mismo tipo se apilan. */
export interface EditorTrack {
  id: string;
  kind: EditorTrackKind;
}

/** Campos que solo usa el front (el back los ignora al renderizar). */
interface EditorClipMeta {
  id: string;
  label: string;
  /** Pista dentro de su tipo (0 = primera pista de video/audio/texto). */
  track: number;
  /** URL de reproducción para la vista previa. */
  url: string;
  /** Duración real de la fuente en segundos (0 si no se pudo medir). */
  src_duration: number;
}

export interface EditorVideoClip extends EditorClipMeta {
  kind: 'video' | 'image';
  source: EditorSource;
  /** Segundo de la fuente donde empieza (video). */
  in: number;
  /** Segundo de la fuente donde termina (video). */
  out: number;
  /** Segundos en pantalla (imagen). */
  length?: number;
  /** Posición absoluta en la línea de tiempo (pistas superpuestas, track > 0). */
  start?: number;
  /** Volumen del audio original, 0..2 (por defecto 1). */
  volume?: number;
  /** La fuente tiene pista de sonido (lo informa el servidor al importarla). */
  has_audio?: boolean;
  /** El sonido vive en un clip de audio vinculado (el render no lo duplica). */
  audio_detached?: boolean;
}

export interface EditorAudioClip extends EditorClipMeta {
  /** Si viene del sonido de un video, su id (el clip se deriva de ese video). */
  linked_video_id?: string;
  source: EditorSource;
  /** Posición en la línea de tiempo (segundos). */
  start: number;
  in: number;
  out: number;
  volume?: number;
}

export interface EditorTextClip {
  id: string;
  /** Pista dentro de las pistas de texto (0 = primera). */
  track: number;
  text: string;
  start: number;
  end: number;
  /** Ancla horizontal 0..1 (0.5 = centrado). */
  x: number;
  /** Ancla vertical 0..1. */
  y: number;
  size: number;
  /** #RRGGBB */
  color: string;
}

/** Material importado al proyecto (la galería de assets); los clips se crean a partir de él. */
export interface EditorAsset {
  id: string;
  kind: 'video' | 'image' | 'audio';
  name: string;
  /** URL de reproducción (relativa al servidor o absoluta). */
  url: string;
  /** Miniatura (imágenes y póster generado por el servidor para los videos). */
  thumb: string;
  /** Si viene de la biblioteca. */
  fileId?: string;
  /** Segundos (0 en imágenes). */
  duration: number;
  /** La fuente tiene pista de sonido. */
  hasAudio?: boolean;
}

export interface EditorProject {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: EditorTrack[];
  assets: EditorAsset[];
  video: EditorVideoClip[];
  audio: EditorAudioClip[];
  texts: EditorTextClip[];
}

export interface EditorProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface EditorProjectRecord extends EditorProjectSummary {
  project: EditorProject;
}

export type RenderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type RenderFormat = 'mp4' | 'mp4_h265' | 'mov' | 'webm' | 'gif';

/** Formatos que ofrece el modal de exportación. */
export const RENDER_FORMATS: readonly {
  value: RenderFormat;
  labelKey: string;
  descKey: string;
  ext: string;
}[] = [
  {
    value: 'mp4',
    labelKey: 'EDITOR.EXPORT_DIALOG.FORMAT_MP4',
    descKey: 'EDITOR.EXPORT_DIALOG.FORMAT_MP4_DESC',
    ext: 'mp4',
  },
  {
    value: 'mp4_h265',
    labelKey: 'EDITOR.EXPORT_DIALOG.FORMAT_H265',
    descKey: 'EDITOR.EXPORT_DIALOG.FORMAT_H265_DESC',
    ext: 'mp4',
  },
  {
    value: 'mov',
    labelKey: 'EDITOR.EXPORT_DIALOG.FORMAT_MOV',
    descKey: 'EDITOR.EXPORT_DIALOG.FORMAT_MOV_DESC',
    ext: 'mov',
  },
  {
    value: 'webm',
    labelKey: 'EDITOR.EXPORT_DIALOG.FORMAT_WEBM',
    descKey: 'EDITOR.EXPORT_DIALOG.FORMAT_WEBM_DESC',
    ext: 'webm',
  },
  {
    value: 'gif',
    labelKey: 'EDITOR.EXPORT_DIALOG.FORMAT_GIF',
    descKey: 'EDITOR.EXPORT_DIALOG.FORMAT_GIF_DESC',
    ext: 'gif',
  },
];

export interface RenderJob {
  id: string;
  project_id?: string;
  status: RenderJobStatus;
  progress: number;
  error?: string;
  file_id?: string;
  output_url?: string;
  format?: RenderFormat;
  created_at: string;
  updated_at: string;
}

/** Material que otras pantallas envían al editor ("Enviar al editor"). */
export interface EditorClipInput {
  kind: 'video' | 'image' | 'audio';
  /** URL para reproducir (relativa al servidor o absoluta). */
  url: string;
  name: string;
  /** Si viene de la biblioteca. */
  fileId?: string;
  /** Duración conocida en segundos. */
  duration?: number;
  /** El clip trae sonido (se muestra su onda en la pista de video). */
  hasAudio?: boolean;
}

/** Respuesta de GET /render/media. */
export interface EditorMediaInfo {
  duration: number;
  has_audio: boolean;
  has_video: boolean;
  poster?: string;
}

export type EditorSelection =
  | { track: 'video'; id: string }
  | { track: 'audio'; id: string }
  | { track: 'text'; id: string }
  | null;

/** Tope de la subida a la biblioteca (el back lo impone con MAX_UPLOAD_BYTES). */
export const EDITOR_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const EDITOR_DEFAULT_IMAGE_SECONDS = 3;
export const EDITOR_MIN_CLIP_SECONDS = 0.1;
export const EDITOR_MAX_SECONDS = 600;
