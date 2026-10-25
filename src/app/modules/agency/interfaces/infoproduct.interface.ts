/** Metadatos medidos con ffprobe/ffmpeg sobre el video de referencia. */
export interface VideoMeta {
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  aspect_ratio: string;
  has_audio: boolean;
  cuts: number[];
  cuts_count: number;
  source: 'file' | 'url';
}

export interface BreakdownShot {
  index: number;
  start: number;
  end: number;
  shot_type?: string;
  camera_angle?: string;
  camera_movement?: string;
  description?: string;
  transition_out?: string;
}

export interface BreakdownText {
  time?: string;
  text?: string;
  style?: string;
}

/** Desglose estructurado que devuelve el cerebro (todo opcional: el LLM varía). */
export interface VideoBreakdown {
  summary?: string;
  video_type?: string;
  video_type_notes?: string;
  duration_sec?: number;
  aspect_ratio?: string;
  pacing?: string;
  hook?: string;
  cuts_count?: number;
  shots?: BreakdownShot[];
  has_person?: boolean;
  person?: {
    description?: string;
    age_range?: string;
    wardrobe?: string;
    actions?: string;
    speaks_to_camera?: boolean;
  } | null;
  has_motion_graphics?: boolean;
  motion_graphics?: string;
  on_screen_text?: BreakdownText[];
  animation_style?: string;
  setting_and_lighting?: string;
  product_presentation?: string;
  music?: {
    present?: boolean;
    genre?: string;
    mood?: string;
    tempo?: string;
    description?: string;
  } | null;
  voiceover?: {
    present?: boolean;
    language?: string;
    tone?: string;
    transcript?: string;
  } | null;
  sound_effects?: string[];
  call_to_action?: string;
  replication_notes?: string[];
}

export interface AnalysisUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

export interface VideoAnalysis {
  id: string;
  source_url: string;
  model: string;
  meta: VideoMeta;
  breakdown: VideoBreakdown;
  summary: string;
  created_at: string;
  cached: boolean;
  usage?: AnalysisUsage;
}

export interface AnalyzeVideoRequest {
  /** Video subido (id de archivo) — o `url`, nunca ambos. */
  file_id?: string;
  url?: string;
  model?: string;
  force?: boolean;
}

/** Límites del modelo de video elegido (salen del catálogo). */
export interface ComposeTarget {
  model: string;
  max_duration: number;
  durations: number[];
  ratios: string[];
  resolutions: string[];
  supports_audio: boolean;
  audio_reference: boolean;
  max_references: number;
}

export interface ComposeRequest {
  breakdown: VideoBreakdown;
  model?: string;
  target: ComposeTarget;
  image_file_ids: string[];
  audio_file_ids: string[];
  notes?: string;
  format_id?: string;
}

export interface VideoPromptIngredient {
  file_id: string;
  tag: string;
  role: string;
}

export interface VideoPromptAudioRef {
  file_id: string;
  tag: string;
  kind: 'music' | 'voiceover';
  note: string;
}

export interface VideoPromptSegment {
  index: number;
  start: number;
  end: number;
  prompt: string;
}

export interface VideoPrompt {
  prompt: string;
  model: string;
  duration: number;
  ratio: string;
  resolution: string;
  generate_audio: boolean;
  ingredients: VideoPromptIngredient[];
  audio_refs: VideoPromptAudioRef[];
  segments: VideoPromptSegment[];
  warnings: string[];
}

export interface ComposeResponse {
  video_prompt: VideoPrompt;
  segments_required: number;
  usage: AnalysisUsage;
}

/** Formato de video guardado como preset del grupo "formats". */
export interface VideoFormat {
  id: string;
  code: string;
  label: string;
  prompt: string;
  active: boolean;
}
