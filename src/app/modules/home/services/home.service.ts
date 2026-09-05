import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Home } from '../interfaces';
import { HomeApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class HomeService {
  private readonly homeApiRepository = inject(HomeApiRepository);

  listHomes(): Observable<Home[]> {
    return this.homeApiRepository.listHomes();
  }
}
