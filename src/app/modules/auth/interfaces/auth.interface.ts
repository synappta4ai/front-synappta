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

/** Aceptación registrada (POST /consents, prueba Ley 1581). */
export interface Consent {
  id: number;
  user_id: number;
  doc_type: string;
  doc_version: string;
  accepted_at: string;
  method: string;
}

/** Cuerpo de POST /consents: el back estampa fecha, ip y user agent. */
export interface AcceptConsentRequest {
  doc_type: string;
  doc_version: string;
  method: string;
}
