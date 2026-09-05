import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Video } from '../interfaces';

@Injectable({ providedIn: 'root' })
export class VideoApiRepository {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listVideos(): Observable<Video[]> {
    return this.http.get<Video[]>(`${this.apiUrl}/videos`);
  }
}
