import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Auth } from '../interfaces';
import { AuthApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApiRepository = inject(AuthApiRepository);

  getSession(): Observable<Auth> {
    return this.authApiRepository.getSession();
  }
}
