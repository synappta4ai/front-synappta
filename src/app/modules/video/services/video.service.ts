import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Video } from '../interfaces';
import { VideoApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly videoApiRepository = inject(VideoApiRepository);

  listVideos(): Observable<Video[]> {
    return this.videoApiRepository.listVideos();
  }
}
