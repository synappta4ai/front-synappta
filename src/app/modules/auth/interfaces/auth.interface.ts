export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'DIRECTOR' | 'USER';

export interface User {
  id: number;
  username: string;
  name: string;
  surname: string;
  user_name: string;
  email: string;
  role_level: number;
  role_name: RoleName;
  active: boolean;
  /** Foto de perfil: id del archivo en la biblioteca y su URL pública de serve. */
  avatar_file_id?: string | null;
  avatar_url?: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  name?: string;
  surname?: string;
  user_name?: string;
  email?: string;
}

export interface TokenResponse {
  token: string;
  user: User;
  tenant_id: number;
}

/** Cuerpo de PUT /user/profile/avatar: ambos vacíos borra la foto. */
export interface UpdateAvatarRequest {
  avatar_file_id?: string;
  avatar_url?: string;
}
