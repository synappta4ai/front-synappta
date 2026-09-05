import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Agency } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class AgencyApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listAgencies(): Observable<Agency[]> {
    return this.http.get<Agency[]>(`${this.apiUrl}/agencies`);
  }
}
