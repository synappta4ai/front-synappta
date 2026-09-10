import { PageParams, TableLazyLoadEvent } from '@interfaces/api.interface';

/**
 * Formatear los parámetros de la tabla para la API
 * @param event Evento de la tabla
 * @returns Parámetros formateados
 */
export const formatPageParams = <T>(event: TableLazyLoadEvent): PageParams<T> => {
  const page = (event.first || 0) / (event.rows || 10) + 1;
  const limit = event.rows || 10;
  const search = event.globalFilter as string;

  return {
    page,
    limit,
    search,
    sort: 'id',
    order: 'desc',
    params: null as T,
  };
};
