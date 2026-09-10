import { User } from '@modules/auth/interfaces';

export type { User };

export interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export const initialAuthState: AuthState = {
  user: null,
  token: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: false,
};
