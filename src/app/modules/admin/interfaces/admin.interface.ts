export interface Tenant {
  id: number;
  slug: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
}

export type CredentialProviderType = 'byteplus' | 'gemini' | 'anthropic' | 'higgsfield';

/** Modelo del catálogo anotado con el estado de credenciales del tenant. */
export interface TenantModel {
  name: string;
  display_name: string | null;
  modality: 'video' | 'image' | 'text';
  generator: string;
  credential_provider: CredentialProviderType;
  base_url: string;
  endpoint: string;
  gallery_sync: boolean;
  defaults: {
    ratios?: string[];
    resolutions?: string[];
    durations?: number[];
  };
  credential_configured: boolean;
}

/** Credencial enmascarada (nunca devuelve secretos). */
export interface TenantCredential {
  id: string;
  provider: CredentialProviderType;
  display_name?: string;
  access_key_id: string;
  api_key_mask: string;
  endpoint: string;
  base_url: string;
  extra?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertTenantCredentialRequest {
  provider: CredentialProviderType;
  display_name?: string;
  access_key_id?: string;
  secret_access_key?: string;
  api_key?: string;
  endpoint?: string;
  base_url?: string;
  extra?: string;
}

/** Una credencial dentro del archivo de exportación (secretos en claro). */
export interface ExportedCredential {
  provider: CredentialProviderType;
  display_name?: string;
  access_key_id?: string;
  secret_access_key?: string;
  api_key?: string;
  endpoint?: string;
  base_url?: string;
  extra?: string;
}

/** Formato de archivo para exportar/importar credenciales de un tenant. */
export interface CredentialsExport {
  version: number;
  exported_at: string;
  credentials: ExportedCredential[];
}

/** Usuario miembro de un tenant. */
export interface TenantUser {
  id: number;
  username: string;
  name: string;
  surname: string;
  user_name: string;
  email: string;
  role_level: number;
  role_name: string;
  active: boolean;
}

/** Miembro de un tenant con su rol de membresía y permisos. */
export interface TenantMember {
  id: number;
  username: string;
  name: string;
  surname: string;
  user_name: string;
  email: string;
  active: boolean;
  role_level: number;
  role_name: string;
  permissions: string[];
}

/** Entrada del catálogo de permisos del back. */
export interface PermissionDef {
  key: string;
  label: string;
}

/** Usuario global (para adjuntar uno existente a un tenant). */
export interface PlatformUser {
  id: number;
  username: string;
  name: string;
  surname: string;
  email: string;
  active: boolean;
}

export interface CreateTenantMemberRequest {
  /** Adjuntar un usuario existente (si se define, ignora username/password). */
  user_id?: number;
  username?: string;
  password?: string;
  name?: string;
  surname?: string;
  user_name?: string;
  email?: string;
  role_level?: number;
  permissions?: string[];
}

/** Traza de una comunicación con una API externa (auditada). */
export interface ServerCommunicationLog {
  id: string;
  task_id: string;
  model_name: string;
  endpoint: string;
  method: string;
  /** "generate" = envío de la generación, "poll" = última respuesta del polling. */
  phase?: string;
  /** Cuántas llamadas de polling se acumularon para esta tarea. */
  poll_count: number;
  /** Momento del envío (común a ambas fases de la tarea). */
  started_at?: string;
  /** Momento del último poll terminal (solo fase polling). */
  finished_at?: string;
  /** Milisegundos entre el envío y la respuesta final (fase polling). */
  total_duration_ms: number;
  request_body?: string;
  response_body?: string;
  status_code: number;
  duration_ms: number;
  error_message?: string;
  // Audit
  user_id: number;
  username: string;
  tenant_slug: string;
  credential_provider: string;
  api_key_mask: string;
  access_key_mask: string;
  secret_key_mask: string;
  auth_type: string;
  created_at: string;
}

export interface ServerCommsPage {
  logs: ServerCommunicationLog[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ─── Generated videos gallery ────────────────────────────────

/** Output file of a generation (server-relative or absolute URL). */
export interface GenerationOutput {
  url: string;
  localUrl?: string;
  type: string;
}

/** One completed generation with its project/piece/user context. */
export interface GeneratedMedia {
  id: string;
  task_id: string;
  model_name: string;
  user_id: number | null;
  event_id: string | null;
  piece_id: string | null;
  piece_code: string | null;
  generation_number: number | null;
  outputs: GenerationOutput[] | null;
  status: string;
  resource_type: string | null;
  usage_tokens: number;
  usage_completion_tokens: number;
  video_duration: number;
  video_resolution: string;
  video_ratio: string;
  video_seed: number;
  video_fps: number;
  progress: number;
  created_at: string;
  // Enriched (LEFT JOIN in the backend)
  event_name: string;
  user_display_name: string;
  piece_name: string;
}

export interface GeneratedVideosPage {
  logs: GeneratedVideo[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  /** Tenant dueño de los datos (visible para superadmin). */
  tenant_slug?: string;
}

export type GeneratedImagesPage = GeneratedVideosPage;
export type GeneratedImage = GeneratedMedia;
export type GeneratedVideo = GeneratedMedia;
