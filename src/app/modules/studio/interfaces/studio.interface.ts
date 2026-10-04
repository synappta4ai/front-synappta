import { AiModel, GenerateRequest, StatusResponse } from '@modules/agency/interfaces';

/** Model type reported by the backend catalog: api (external provider) or
 * downloaded (weights on the brain-master inference worker). */
export type StudioModelType = 'api' | 'downloaded';

/** View-model of a catalog entry for the studio's model picker. */
export interface StudioModel {
  name: string;
  displayName: string;
  type: StudioModelType;
  modality: string;
  /** provider badge: byteplus | gemini | … | worker */
  badge: string;
  /** vram_gb for downloaded models, if reported. */
  vramGb?: number;
  /** available=false → listed by the worker but not runnable. */
  available: boolean;
  source: AiModel;
}

/** Reference image cited in the original generation request. */
export interface StudioTakeRef {
  id: string;
  name: string;
}

/** One generation attempt shown in the take reel / queue. */
export interface StudioTake {
  id: string; // task id
  prompt: string;
  modelName: string;
  modelDisplayName: string;
  modelType: StudioModelType;
  ratio: string;
  resolution: string;
  duration: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  videoUrl: string | null;
  error: string | null;
  createdAt: number;
  /** Two-check rating: "Buena toma" (aprobada) / "Elegida final". */
  ratingGood?: boolean;
  ratingFinal?: boolean;
  /** Gasto de la API del proveedor: créditos (Higgsfield) y USD estimado. */
  costCredits?: number;
  costUsd?: number;
  /** "Transaction ID" con el que la generación aparece en Higgsfield. */
  transactionId?: string | null;
  /** Proyecto (evento) al que quedó ligada la generación. */
  eventName?: string | null;
  /** Usuario creador (según el log; en el reel siempre es el propio). */
  userName?: string | null;
  /** Imágenes de referencia enviadas (para miniaturas en reel y cola). */
  refImages?: StudioTakeRef[];
  /** Request original; permite "volver a generar" una toma existente. */
  request?: GenerateRequest | null;
}

/** Re-export for template convenience. */
export type { StatusResponse };
