import { ResponseBase } from './common';

export interface PageParams<T> {
  page: number;
  limit: number;
  search: string;
  sort: string;
  order: 'asc' | 'desc';
  params?: T;
}

export interface PageData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PageResponse<T> extends ResponseBase<any> {
  data: PageData<T>;
}
