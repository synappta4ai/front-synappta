export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type Rols = 'ADMIN' | 'SUPER_ADMIN';

export type RolsId = 2 | 1;

export interface Base64 {
  name: string;
  mimeType: string;
  base64: string;
}

export type StatusServices = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

export type OptionType = {
  value: string;
  label: string;
};

export interface ResponseBase<T> {
  success: boolean;
  message: string;
  errors?: string[];
  data: T;
}

export interface error {
  title: string;
  detail: string;
}

export interface ErrorsResponse {
  errors: error[];
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  route?: string;
  children?: MenuItem[];
  expanded?: boolean;
}

export interface MenuSectionItem {
  title: string;
  icon: string;
  items: MenuItem[];
  expanded?: boolean;
}

export interface ListId {
  id: number;
  name: string;
}
