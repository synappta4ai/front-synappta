export type Modality = 'video' | 'image' | 'text';
export type CredentialProvider = 'byteplus' | 'gemini' | 'anthropic';
export type TaskStatus =
  'pending' | 'processing' | 'completed' | 'succeeded' | 'failed' | 'cancelled';

export interface AiModel {
  name: string;
  display_name: string | null;
  content_type: Modality | null;
  credential_provider: CredentialProvider | null;
  base_url: string | null;
  endpoint: string | null;
  [key: string]: unknown;
}

export interface Credential {
  provider: CredentialProvider;
  api_key: string | null;
  metadata: Record<string, unknown> | null;
}

export interface UpsertCredentialRequest {
  provider: CredentialProvider;
  api_key?: string;
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
