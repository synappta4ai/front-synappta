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
