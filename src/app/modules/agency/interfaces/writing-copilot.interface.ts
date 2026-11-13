/** Tipo de video: elige la guía de estructura que usa el cerebro en el paso 1. */
export type WritingCopilotVideoType = 'commercial_short' | 'commercial_long' | 'story_short' | 'story_long';

/** Parámetros opcionales del agente Writing Copilot (solo se envían los informados). */
/** Nombres de parámetro idénticos a la sección 3 del skill Synappta-WRITE. */
export interface WritingCopilotParams {
  output_language?: 'es' | 'en' | 'bilingual';
  response_mode?: 'chat' | 'prompt_only';
  delivery?: 'sequence' | 'shot_pack' | 'auto';
  aspect_ratio?: string;
  total_duration_s?: number;
  max_clip_s?: number;
  /** Cortes/planos dentro del clip. */
  shot_count?: number;
  /** Cambios de encuadre dentro de cada toma. */
  cuts_per_shot?: number;
  fps?: number;
  look?: string;
  audio_mode?: 'diegetic_only' | 'with_dialogue' | 'with_music_notes' | 'silent';
  target_model?: string;
  /** Guía de estructura del paso 1 (comercial o historia, corta o larga). */
  video_type?: WritingCopilotVideoType;
  /** Bloque de iluminación / dirección de arte elegido. */
  lighting?: string;
}

export interface WritingCopilotHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Cuerpo de POST /writing-copilot/chat. */
export interface WritingCopilotRequest {
  message: string;
  /** Modelo del cerebro: nombre del catálogo (openrouter/... o anthropic/...). */
  model?: string;
  history?: WritingCopilotHistoryMessage[];
  params?: WritingCopilotParams;
  references?: string;
  /** Ids de imagenes subidas que el cerebro recibe como vision. */
  reference_files?: string[];
}

export interface WritingCopilotUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

/** Respuesta del agente: texto completo + bloques de código para copiar. */
export interface WritingCopilotResponse {
  text: string;
  prompts: string[];
  model: string;
  usage?: WritingCopilotUsage;
}

/** Turno de la conversación tal como lo muestra la pantalla. */
export interface WritingCopilotTurn {
  role: 'user' | 'assistant';
  content: string;
}
