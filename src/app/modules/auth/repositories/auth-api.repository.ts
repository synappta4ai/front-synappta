import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Auth } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class AuthApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getSession(): Observable<Auth> {
    return this.http.get<Auth>(`${this.apiUrl}/auth`);
  }
}
