import { AiModel, StatusResponse } from '@modules/agency/interfaces';

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
}

/** Re-export for template convenience. */
export type { StatusResponse };
