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
  jobs_active: number;
  models: WorkerModel[];
  last_heartbeat: string;
  created_at: string;
  /** Derivado del último heartbeat en el back (no se persiste). */
  online: boolean;
}

/** Código de emparejamiento de 6 dígitos con TTL corto. */
export interface PairingCode {
  code: string;
  expires_at: string;
}

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
