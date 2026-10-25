import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AiModel, TenantPrefsView } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';

import { TenantModelsComponent } from './tenant-models.component';

function model(name: string, flags: Partial<AiModel> = {}): AiModel {
  return {
    name,
    display_name: name,
    modality: 'image',
    generator: 'x',
    credential_provider: 'gemini',
    base_url: 'https://example.test',
    endpoint: '/x',
    gallery_sync: false,
    defaults: {},
    ...flags,
  };
}

const VIEW: TenantPrefsView = {
  models: [model('soul'), model('gem', { recommended: true, favorite: true })],
  disabled: ['flux'],
  mine: {
    gem: { model_name: 'gem', enabled: true, favorite_rank: 0 },
    flux: { model_name: 'flux', enabled: false, favorite_rank: 0 },
  },
};

interface WritableSignal<T> {
  (): T;
  set(value: T): void;
}

interface Internals {
  rows(): Record<string, { enabled: boolean; favoriteRank: number }>;
  visibleRows(): { name: string }[];
  disabledRows(): { name: string }[];
  dirty(): boolean;
  search: WritableSignal<string>;
  providerFilter: WritableSignal<string>;
  first: WritableSignal<number>;
  setRank(name: string, rank: number | null): void;
  setEnabled(name: string, enabled: boolean): void;
  save(): void;
}

describe('TenantModelsComponent', () => {
  let fixture: ComponentFixture<TenantModelsComponent>;
  let component: Internals;
  let upserted: unknown[][];

  beforeEach(async () => {
    upserted = [];
    const agency = {
      getTenantModelPrefs: () => of(VIEW),
      upsertTenantModelPrefs: (prefs: unknown) => {
        upserted.push([prefs]);
        return of(VIEW);
      },
    };
    await TestBed.configureTestingModule({
      imports: [TenantModelsComponent],
      providers: [provideTranslateService(), { provide: AgencyService, useValue: agency }],
    }).compileComponents();
    fixture = TestBed.createComponent(TenantModelsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    component = fixture.componentInstance as unknown as Internals;
  });

  it('inicializa filas: visibles activos, desactivados aparte, ranks propios', () => {
    expect(component.visibleRows().map((r) => r.name)).toEqual(['soul', 'gem']);
    expect(component.disabledRows().map((r) => r.name)).toEqual(['flux']);
    expect(component.rows()['flux']!.enabled).toBe(false);
  });

  it('guarda solo filas cambiadas o propias', () => {
    component.setRank('soul', 2);
    component.save();

    expect(upserted.length).toBe(1);
    const prefs = upserted[0]![0] as { model_name: string; favorite_rank: number }[];
    const byName = new Map(prefs.map((p) => [p.model_name, p]));
    // soul cambió (rank 2); gem y flux tenían fila propia y se reenvían.
    expect(byName.get('soul')?.favorite_rank).toBe(2);
    expect(byName.has('gem')).toBe(true);
    expect(byName.has('flux')).toBe(true);
    expect(component.dirty()).toBe(false);
  });

  it('filtra por proveedor', () => {
    component.providerFilter.set('gemini');
    fixture.detectChanges();
    expect(component.visibleRows().map((r) => r.name)).toEqual(['soul', 'gem']);
    component.providerFilter.set('otro');
    fixture.detectChanges();
    expect(component.visibleRows()).toEqual([]);
  });

  it('cambiar un filtro vuelve a la primera página', () => {
    component.first.set(50);
    component.search.set('soul');
    fixture.detectChanges();
    expect(component.first()).toBe(0);
  });

  it('reactivar un desactivado lo manda habilitado (el back borra la fila)', () => {
    component.setEnabled('flux', true);
    component.save();

    const prefs = upserted[0]![0] as { model_name: string; enabled: boolean }[];
    expect(prefs.find((p) => p.model_name === 'flux')?.enabled).toBe(true);
  });
});
