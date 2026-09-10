export type IngredientType = 'character' | 'location' | 'prop';

export interface Ingredient {
  id: string;
  type: IngredientType;
  name: string;
  description: string | null;
  metadata: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIngredientRequest {
  type?: IngredientType;
  name?: string;
  description?: string;
  metadata?: string;
}

export interface UpdateIngredientRequest extends CreateIngredientRequest {
  type?: IngredientType;
}

export interface IngredientFile {
  file_id: string;
  role: string | null;
  filename: string | null;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  category: string | null;
  format: string | null;
}

export interface AddIngredientFileRequest {
  file_id: string;
  role?: string;
}

export interface FileAsset {
  id: string;
  filename: string;
  url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size: number | null;
  sha256: string | null;
  category: string | null;
  format: string | null;
  storage: string | null;
  trashed: boolean;
  duplicate?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FileListFilters {
  page?: number;
  pageSize?: number;
  category?: string;
  storage?: string;
  q?: string;
}

export interface IngredientListFilters {
  page?: number;
  pageSize?: number;
  type?: IngredientType;
  q?: string;
}

export interface PresetGroup {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePresetGroupRequest {
  name?: string;
  description?: string;
}

export interface PresetContent {
  [key: string]: unknown;
}

export interface Preset {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  content: PresetContent | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePresetRequest {
  group_id?: string;
  name?: string;
  description?: string;
  content?: PresetContent;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillRequest {
  name?: string;
  description?: string;
  prompt?: string;
}
