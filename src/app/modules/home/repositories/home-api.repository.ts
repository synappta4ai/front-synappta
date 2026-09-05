import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Home } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class HomeApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listHomes(): Observable<Home[]> {
    return this.http.get<Home[]>(`${this.apiUrl}/homes`);
  }
}
