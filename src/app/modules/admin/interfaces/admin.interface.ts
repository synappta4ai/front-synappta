export interface Tenant {
  id: number;
  slug: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
}
