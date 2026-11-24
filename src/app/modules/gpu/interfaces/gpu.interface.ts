/** Modelo reportado por una GPU emparejada (snapshot de su catálogo local). */
export interface WorkerModel {
  key: string;
  label: string;
  mode: string;
  engine: string;
  pipeline: string;
  repo: string;
  steps: number;
  vram_gb: number;
  family: string;
  available: boolean;
  notes: string;
  /** Estado real de pesos (el agente lo lee del gRPC local; ausente = legado). */
  downloading?: boolean;
  download_percent?: number;
  size_bytes?: number;
  download_error?: string;
}

/** Una GPU emparejada (fila del registry del back). */
export interface GpuWorker {
  id: string;
  name: string;
  gpu_name: string;
  os: string;
  version: string;
  vram_total_mb: number;
  vram_free_mb: number;
  /** Disco libre donde viven los pesos (ausente en workers viejos). */
  disk_free_mb?: number;
  jobs_active: number;
  models: WorkerModel[];
  last_heartbeat: string;
  created_at: string;
  /** Etiqueta libre que pone el admin en el panel («Sala 2»). */
  label?: string;
  /**
   * En pausa (drenaje): termina el job en curso y no reclama nuevos hasta
   * reanudarla. Sigue emparejada y latiendo.
   */
  paused?: boolean;
  /** Derivado del último heartbeat en el back (no se persiste). */
  online: boolean;
  /**
   * Derivado de la versión por el back: false = esa GPU ignora el pedido de
   * actualización remota (agente viejo) y sólo se actualiza con el instalador.
   */
  self_update?: boolean;
  /**
   * Actualización encolada desde el panel y todavía no confirmada: el agente
   * baja el payload, se reinicia y la limpia al volver con la versión nueva.
   */
  requested_update?: WorkerUpdateRequest | null;
  /**
   * Último intento de actualización que falló, con el motivo que reportó el
   * propio worker (o el watchdog del back si no volvió del reinicio). Ausente
   * = no hay fallo conocido.
   */
  update_failure?: WorkerUpdateFailure | null;
}

/** Actualización remota pedida a una GPU emparejada. */
export interface WorkerUpdateRequest {
  id: string;
  /** Payload .zip que el agente tiene que descargar (vacío = el publicado). */
  url?: string;
  /** SHA-256 del .zip: el agente lo verifica antes de detener el worker. */
  sha256?: string;
  requested_at?: string;
}

/** Resultado fallido de una actualización remota, reportado por el worker. */
export interface WorkerUpdateFailure {
  id: string;
  /** Motivo del fallo tal como lo reportó el agente (descarga, hash, deps...). */
  error: string;
  at?: string;
}

/** Código de emparejamiento de 6 dígitos con TTL corto. */
export interface PairingCode {
  code: string;
  expires_at: string;
}

/**
 * Qué tan bien entra un modelo en la VRAM de la GPU objetivo.
 *
 * `good`   — entra con margen para activaciones y caché (spec + 25 %).
 * `tight`  — entra justo: puede funcionar, pero conviene cerrar otras apps.
 * `insufficient` — pide más VRAM que la que tiene la GPU.
 * `unknown` — falta el dato del catálogo o no hay GPU emparejada.
 */
export type ModelFit = 'good' | 'tight' | 'insufficient' | 'unknown';

/** Estado en vivo de los pesos de un modelo (vista de gestión del worker). */
export interface ManagedWorkerModelDownload {
  mode: string;
  engine: string;
  pipeline: string;
  repo?: string;
  steps?: number;
  vram_gb?: number;
  family?: string;
  available: boolean;
  downloading: boolean;
  download_percent: number;
  size_bytes: number;
  download_error?: string;
  notes?: string;
}

/** Modelo del worker para la gestión de descargas (incluye no disponibles). */
export interface ManagedWorkerModel {
  name: string;
  display_name: string;
  modality: string;
  type: 'downloaded';
  generator?: string;
  downloaded?: ManagedWorkerModelDownload;
  /** Origen bridge: qué GPU lo reporta (para pedir la descarga a esa máquina). */
  worker_id?: string;
  worker_name?: string;
  worker_version?: string;
}

/** Resultado del borrado masivo de pesos ("desinstalar todo"). */
export interface BulkDeleteResult {
  deleted: string[];
  failed: Record<string, string>;
  freed_bytes: number;
}

/** Resultado de una operación sobre los pesos (descarga, cancelación, borrado). */
export interface WorkerModelOperation {
  key: string;
  state: string;
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  error?: string;
}

/** Respuesta de subida del payload del worker (/worker/update-payload). */
export interface WorkerUpdatePayloadResponse {
  path: string;
  size: number;
  url: string;
}

/** Respuesta de orden de actualización del worker (/worker/update). */
export interface WorkerUpdateResponse {
  status: string;
  url?: string;
}
