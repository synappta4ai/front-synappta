import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { CreateTenantRequest, Tenant } from '../interfaces';
import { AdminApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly adminApiRepository = inject(AdminApiRepository);

  listTenants(): Observable<Tenant[]> {
    return unwrap(this.adminApiRepository.listTenants());
  }

  createTenant(payload: CreateTenantRequest): Observable<Tenant> {
    return unwrap(this.adminApiRepository.createTenant(payload));
  }

  deactivateTenant(id: number): Observable<null> {
    return unwrap(this.adminApiRepository.deactivateTenant(id));
  }
}

function unwrap<T>(source: Observable<{ data: T | null; message: string }>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const subscription = source.subscribe({
      next: (response) => {
        if (response.data === null) {
          subscriber.error(new Error(response.message || 'Unexpected empty response'));
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
