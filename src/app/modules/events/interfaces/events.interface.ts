export type EventType = 'event';

export interface Event {
  id: string;
  name: string;
  description: string | null;
  metadata: string | null;
  venue: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  active: boolean;
  program_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEventRequest {
  name: string;
  description?: string;
  metadata?: string;
  venue?: string;
  starts_at?: string;
  ends_at?: string;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {
  status?: string;
  active?: boolean;
}

export interface Program {
  id: string;
  event_id: string;
  number: number;
  name: string | null;
  description: string | null;
  scheduled_at: string | null;
  sort_order: number | null;
  active: boolean;
  piece_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProgramRequest {
  number: number;
  name?: string;
  description?: string;
  scheduled_at?: string;
  sort_order?: number;
}

export interface UpdateProgramRequest extends Partial<CreateProgramRequest> {
  active?: boolean;
}

export interface Piece {
  id: string;
  event_id: string;
  program_id: string | null;
  number: number;
  piece_code: string | null;
  name: string | null;
  description: string | null;
  type: string | null;
  output_format: string | null;
  duration: number | null;
  aspect_ratio: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePieceRequest {
  program_id?: string;
  number: number;
  piece_code?: string;
  name?: string;
  description?: string;
  type?: string;
  output_format?: string;
  duration?: number;
  aspect_ratio?: string;
}

export interface UpdatePieceRequest extends Partial<CreatePieceRequest> {
  active?: boolean;
}

export interface PieceGeneration {
  id: string;
  piece_id: string;
  number: number;
  video_url: string | null;
  video_local_url: string | null;
  status: string | null;
  active: boolean;
  final: boolean | null;
  finalized_at: string | null;
  task_id: string | null;
  rating: number | null;
  request_payload: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGenerationRequest {
  number: number;
  status?: string;
}

export interface UpdateGenerationRequest {
  video_url?: string;
  video_local_url?: string;
  status?: string;
  active?: boolean;
  final?: boolean;
  task_id?: string;
  rating?: number;
}

export interface ProgramWithPieces {
  program: Program;
  pieces: Piece[];
}

export interface EventWithPrograms {
  event: Event;
  programs: ProgramWithPieces[];
}
