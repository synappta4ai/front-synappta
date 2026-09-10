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
