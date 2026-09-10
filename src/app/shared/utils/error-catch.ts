import { HttpErrorResponse } from '@angular/common/http';
import { ErrorsResponse } from '@interfaces/common';
import { Observable, of } from 'rxjs';

export const httpErrorHandler = (
  err: HttpErrorResponse,
): Observable<{
  error: boolean;
  msg: string;
  data: any;
}> => {
  let errorMessage = `Error Code: ${err.status}\nMessage: ${err.message}`;
  if (err.error?.message) {
    errorMessage = err.error?.message;
  }
  try {
    err.error as unknown as ErrorsResponse;
    if (err.error.errors) {
      errorMessage = err.error.errors[0].detail;
    }
  } catch {}
  return of({ error: true, msg: errorMessage, data: null });
};
