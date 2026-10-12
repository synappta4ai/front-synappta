import { Observable } from 'rxjs';

import { ApiResponse } from '@interfaces/api.interface';

export function unwrap<T>(source: Observable<ApiResponse<T>>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        // success:false es error real; success:true con data:null es una
        // respuesta de solo-mensaje (p.ej. logout o confirmaciones).
        if (response.success === false) {
          subscriber.error(new Error(response.message || 'Request failed'));
          return;
        }
        if (response.data === null) {
          subscriber.next(null as T);
          subscriber.complete();
          return;
        }
        subscriber.next(response.data);
        subscriber.complete();
      },
      error: (err: unknown) => subscriber.error(err),
    });
    return () => subscription.unsubscribe();
  });
}
