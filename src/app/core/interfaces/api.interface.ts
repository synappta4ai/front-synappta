export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface Paginated<T> {
  items: readonly T[];
  total: number;
  page: number;
  page_size: number;
}

export interface TableLazyLoadEvent {
  first?: number;
  rows?: number;
  globalFilter?: string;
  sortField?: string;
  sortOrder?: number;
}

export interface PageParams<T> {
  page: number;
  limit: number;
  search: string;
  sort: string;
  order: string;
  params: T | null;
}
