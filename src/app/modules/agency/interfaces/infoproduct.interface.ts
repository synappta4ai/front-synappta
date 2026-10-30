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
  /** Análisis forense completo (skill DCS-ANALYZE); ausente en análisis viejos. */
  dcs_analyze?: DcsAnalyze | null;
  schema_version?: string;
}

/** Tomas del skill DCS-ANALYZE (ficha forense por plano; todo opcional). */
export interface DcsShot {
  index?: number;
  start_s?: number;
  end_s?: number;
  duration_s?: number;
  micro_shot?: boolean;
  timing_precision?: string;
  shot_role?: string;
  shot_size?: string;
  angle_vertical?: string;
  angle_horizontal?: string;
  camera_movement?: {
    type?: string;
    direction?: string;
    speed?: string;
    intensity?: string;
    start_framing?: string;
    end_framing?: string;
    evidence?: string;
    confidence?: string;
  } | null;
  stabilization?: string;
  lens?: {
    class?: string;
    focal_length_estimate_mm?: string;
    distortion?: string;
    perspective_compression?: string;
    character?: string;
    confidence?: string;
  } | null;
  depth_of_field?: {
    dof?: string;
    focus_target?: string;
    focus_behavior?: string;
    bokeh_shape?: string;
    bokeh_quality?: string;
  } | null;
  motion_blur?: string;
  lighting?: {
    setup?: string;
    key_direction?: string;
    quality?: string;
    contrast_ratio?: string;
    pattern?: string;
    atmosphere?: string;
  } | null;
  exposure_and_color?: {
    exposure?: string;
    key?: string;
    contrast?: string;
    black_level?: string;
    white_balance_k?: number | null;
    tint?: string;
    palette_hex?: string[];
    look?: string[];
  } | null;
  optical_artifacts?: readonly { id?: string; where?: string; severity?: string }[];
  effects?: readonly { name?: string; intensity?: string; purpose?: string }[];
  transition_out?: {
    type?: string;
    duration_s?: number;
    direction?: string;
    hidden_cut_cause?: string;
    evidence?: string;
    purpose?: string;
  } | null;
  subject_action?: string;
  product_visible?: { visible?: boolean; piece?: string; how_shown?: string } | null;
  shot_purpose?: string;
  replicability?: { rating?: string; notes?: string } | null;
  confidence?: string;
}

/** Documento completo del skill DCS-ANALYZE (sección técnica del desglose). */
export interface DcsAnalyze {
  schema_version?: string;
  visual_style?: {
    medium?: string;
    format?: string;
    aesthetics?: string[];
    production_tier?: string;
    capture_device_guess?: string;
    ai_generation_confidence?: string;
  } | null;
  editing_style?: {
    primary?: string;
    secondary?: string[];
    justification?: string;
    metrics?: {
      shot_count?: number;
      cut_count?: number;
      average_shot_length_s?: number;
      median_shot_length_s?: number;
      shortest_shot_s?: number;
      longest_shot_s?: number;
      cuts_per_second?: number;
      micro_shot_count?: number;
      pace_class?: string;
      beat_sync_ratio?: number | null;
    } | null;
    continuity_devices?: string[];
  } | null;
  camera_summary?: {
    dominant_movement?: string;
    static_share_pct?: number;
    movement_distribution?: readonly {
      type?: string;
      count?: number;
      runtime_share_pct?: number;
    }[];
    shot_size_distribution?: readonly {
      shot_size?: string;
      count?: number;
      runtime_share_pct?: number;
    }[];
    angle_distribution?: readonly {
      angle_vertical?: string;
      count?: number;
      runtime_share_pct?: number;
    }[];
    stabilization_overall?: string;
    camera_personality?: string;
  } | null;
  technical_signature?: {
    lens_family?: string;
    dof_overall?: string;
    bokeh_overall?: string;
    key_overall?: string;
    exposure_overall?: string;
    white_balance_overall_k?: number | null;
    color_grade_overall?: {
      palette_hex?: string[];
      temperature_bias?: string;
      saturation?: string;
      look?: string[];
    } | null;
    lighting_overall?: { setup?: string[]; key_direction?: string; quality?: string } | null;
    optical_artifacts_overall?: readonly { id?: string; where?: string; severity?: string }[];
    motion_blur_overall?: string;
    frame_rate_feel_overall?: string;
    grain_overall?: string;
    sharpness_overall?: string;
  } | null;
  effects_summary?: readonly {
    name?: string;
    count?: number;
    time_ranges_s?: string[];
    purpose?: string;
    made_with?: string;
  }[];
  transitions_summary?: {
    distribution?: readonly { type?: string; count?: number }[];
    signature_transition?: string;
    notes?: string;
  } | null;
  quality?: {
    checks_passed?: boolean;
    timeline_source?: string;
    reconciled?: boolean;
    model_shots?: number;
    uncertainties?: string[];
    assumptions?: string[];
  } | null;
  shots?: readonly DcsShot[];
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

export type IngredientRole = 'person' | 'product';

export interface ComposeRequest {
  breakdown: VideoBreakdown;
  model?: string;
  target: ComposeTarget;
  target_model?: string;
  image_file_ids: string[];
  audio_file_ids: string[];
  /** Videos de referencia (modelos con reference video). */
  video_file_ids?: string[];
  image_roles?: Record<string, IngredientRole>;
  fps?: number;
  aspect_ratio?: string;
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

/** Clip de referencia enviado al generador como video. */
export interface VideoPromptVideoRef {
  file_id: string;
  tag: string;
  name: string;
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
  video_refs?: VideoPromptVideoRef[];
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
