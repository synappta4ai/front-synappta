/** Modalidades del catálogo del back; `audio` cubre los modelos de voz. */
export type Modality = 'video' | 'image' | 'text' | 'audio';
export type CredentialProvider =
  | 'byteplus'
  | 'gemini'
  | 'anthropic'
  | 'higgsfield'
  | 'openrouter'
  /** Servidores OpenAI-compatibles del propio tenant (sin API key). */
  | 'ollama'
  | 'lmstudio';
export type TaskStatus =
  'pending' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'cancelled';

export interface AiModel {
  name: string;
  display_name: string | null;
  modality: Modality;
  generator: string;
  credential_provider: CredentialProvider;
  base_url: string;
  endpoint: string;
  gallery_sync: boolean;
  /** Ruta i2v gemela del modelo (back: image_endpoint). */
  image_endpoint?: string;
  /** Ruta multi-referencia (back: reference_endpoint): habilita adjuntar
   *  varias fotos reales a la generación de video. */
  reference_endpoint?: string;
  /** Cuántas imágenes de referencia acepta el modelo (back: max_references).
   *  0/undefined = no admite referencias. */
  max_references?: number;
  /** true = LLM con razonamiento (back: reasoning). Solo estos van al Cerebro. */
  reasoning?: boolean;
  defaults: {
    ratios?: string[];
    resolutions?: string[];
    durations?: number[];
  };
  /** 'downloaded' = corre en el inference worker del tenant (back: type). */
  type?: string;
  /** Detalle del worker para modelos downloaded (back: downloaded):
   *  available=false = listado pero no ejecutable. */
  downloaded?: { vram_gb?: number; available?: boolean } | null;
}

export interface Credential {
  provider: CredentialProvider;
  api_key: string | null;
  /** Enmascarado del back (GET /credentials nunca devuelve el secreto). */
  api_key_mask?: string;
  base_url?: string;
  /** JSON con campos extra del proveedor, p.ej. {"model":"..."}. */
  extra?: string;
  metadata: Record<string, unknown> | null;
}

export interface UpsertCredentialRequest {
  provider: CredentialProvider;
  api_key?: string;
  base_url?: string;
  extra?: string;
  metadata?: Record<string, unknown>;
}

export type ContentItemType = 'text' | 'image' | 'video' | 'audio';

export interface ContentItem {
  type: ContentItemType;
  text?: string;
  name?: string;
  id?: string;
}

export interface GenerateRequest {
  model: string;
  content: ContentItem[];
  ratio?: string;
  duration?: number;
  camerafixed?: boolean;
  seed?: string;
  quality?: string;
  quantity?: number;
  watermark?: boolean;
  resolution?: string;
  generate_audio?: boolean;
  image_mode?: string;
  event_name?: string;
  user_name?: string;
  event_id: string;
  program_id?: string;
  piece_id: string;
  piece_code: string;
  generation_number: number;
  user_id?: number;
  /** Dirección del inference worker de este usuario para modelos downloaded.
   * Si se envía, el back lo usa en vez de BM_WORKER_ADDR global. */
  worker_addr?: string;
}

export interface OutputResource {
  url: string;
  localUrl?: string;
  type: ContentItemType;
}

export interface GenerateResponse {
  taskId: string;
  model: string;
  status: string;
  outputs?: OutputResource[];
  /** Gasto estimado por el proveedor (Higgsfield): créditos y USD. */
  cost_credits?: number;
  cost_usd?: number;
  /** "Transaction ID" con el que la generación aparece en la consola del proveedor. */
  provider_transaction_id?: string;
}

export interface StatusOutput {
  url: string;
  localUrl?: string;
  type: string;
}

export interface StatusResponse {
  status: string;
  outputs?: StatusOutput[];
  error?: string;
  progress?: unknown;
  /** Estimated progress percent (0-100) computed by the server; 100 on success. */
  progress_percent?: number;
}

export interface PreviewPayloadResponse {
  model: string;
  endpoint: string;
  payload: Record<string, unknown>;
  content_type: string;
}

export interface GenerationLogsFilters {
  page?: number;
  limit?: number;
  status?: string;
  model_name?: string;
  event_id?: string;
  piece_id?: string;
  resource_type?: string;
  task_id?: string;
}

export interface GenerationLog {
  id: string;
  task_id: string;
  model_name: string;
  user_id: number | null;
  event_id: string | null;
  program_id: string | null;
  piece_id: string | null;
  piece_code: string | null;
  generation_number: number | null;
  request: string | null;
  outputs: OutputResource[] | null;
  status: string;
  error_message: string | null;
  resource_type: string | null;
  estimated_cost: number | null;
  cost_source: string | null;
  /** Gasto en créditos del proveedor (Higgsfield). */
  cost_credits: number;
  /** "Transaction ID" del proveedor (request_id de Higgsfield). */
  provider_transaction_id: string;
  usage_tokens: number;
  usage_completion_tokens: number;
  video_duration: number;
  video_resolution: string;
  video_ratio: string;
  video_seed: number;
  video_fps: number;
  progress: number;
  rating_good: boolean;
  rating_final: boolean;
  event_name: string | null;
  piece_name: string | null;
  user_display_name: string | null;
  created_at: string;
}

export interface GenerationLogsPage {
  logs: GenerationLog[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CostSummary {
  total_cost: number;
}

export interface ServerCommsFilters {
  page?: number;
  limit?: number;
  task_id?: string;
  model_name?: string;
}

export interface ServerCommunication {
  id: string;
  task_id: string | null;
  model_name: string | null;
  endpoint: string;
  method: string;
  request_body: string | null;
  response_body: string | null;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface ServerCommsPage {
  communications: ServerCommunication[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SyncAssetResult {
  id: string;
  model_id: string;
  file_id: string;
  asset_id?: string;
  asset_group_id?: string;
  status: string;
  error_message?: string;
  reference_uri?: string;
  normalized?: boolean;
}

export interface ModelAsset {
  id: string;
  model_id: string;
  file_id: string;
  asset_group_id: string | null;
  status: string;
  asset_type: string | null;
  asset_id: string | null;
  asset_url: string | null;
  reference_uri: string | null;
  error_message: string | null;
  created_at: string;
}

/** Resultado de POST /agency/brief/extract: texto plano del folleto subido. */
export interface BriefExtraction {
  filename: string;
  text: string;
  chars: number;
  truncated: boolean;
}

export interface GeneratedAsset {
  id: string;
  task_id: string;
  model_name: string;
  user_id: number | null;
  event_id: string | null;
  program_id: string | null;
  piece_id: string;
  piece_code: string | null;
  generation_number: number | null;
  original_url: string;
  local_url: string | null;
  status: string;
  created_at: string;
}
