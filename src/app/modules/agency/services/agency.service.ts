import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Agency } from '../interfaces';
import { AgencyApiRepository } from '../repositories';

@Injectable({ providedIn: 'root' })
export class AgencyService {
  private readonly agencyApiRepository = inject(AgencyApiRepository);

  listAgencies(): Observable<Agency[]> {
    return this.agencyApiRepository.listAgencies();
  }
}
