import { User } from '@modules/auth/interfaces';

export type { User };

export interface AuthState {
  user: User | null;
  token: string | null;
  tenantId: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** true cuando el estado ya fue restaurado desde IndexedDB/localStorage */
  isHydrated: boolean;
  /** true mientras la restauración inicial está en curso */
  isHydrating: boolean;
}

export const initialAuthState: AuthState = {
  user: null,
  token: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  isHydrating: false,
};
