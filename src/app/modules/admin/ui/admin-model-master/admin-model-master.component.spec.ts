import type { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { AiModel, MasterPrefsView } from '@modules/agency/interfaces';
import { AdminService } from '../../services/admin.service';

import { AdminModelMasterComponent } from './admin-model-master.component';

function model(name: string): AiModel {
  return {
    name,
    display_name: name,
    modality: 'image',
    generator: 'x',
    credential_provider: 'higgsfield',
    base_url: 'https://example.test',
    endpoint: '/x',
    gallery_sync: false,
    defaults: {},
  };
}

const VIEW: MasterPrefsView = {
  models: [model('soul'), model('gem')],
  prefs: {
    soul: {
      model_name: 'soul',
      enabled: false,
      recommend_tags: ['eficiente'],
      metadata: { costo: 'bajo' },
      favorite_rank: 0,
    },
  },
  orphans: [],
};

interface MasterRowShape {
  name: string;
  enabled: boolean;
  recommendTags: string[];
  metadata: Record<string, string>;
}

interface Internals {
  filteredRows(): MasterRowShape[];
  dirty(): boolean;
  setEnabled(name: string, enabled: boolean): void;
  toggleRecommendTag(name: string, tag: string, checked: boolean): void;
  addCustomTags(name: string, raw: string | null): string;
  providerFilter: WritableSignal<string | 'all'>;
  statusFilter: WritableSignal<'all' | 'active' | 'inactive'>;
  addMeta(name: string, keyInput: HTMLInputElement, valueInput: HTMLInputElement): void;
  removeMeta(name: string, key: string): void;
  setRank(name: string, rank: number | null): void;
  predefinedTags(): string[];
  save(): void;
}

describe('AdminModelMasterComponent', () => {
  let fixture: ComponentFixture<AdminModelMasterComponent>;
  let component: Internals;
  let upserted: unknown[][];

  beforeEach(async () => {
    upserted = [];
    const admin = {
      getMasterModelPrefs: () => of(VIEW),
      upsertMasterModelPrefs: (prefs: unknown) => {
        upserted.push([prefs]);
        return of(VIEW);
      },
    };
    await TestBed.configureTestingModule({
      imports: [AdminModelMasterComponent],
      providers: [provideTranslateService(), { provide: AdminService, useValue: admin }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminModelMasterComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    component = fixture.componentInstance as unknown as Internals;
  });

  it('refleja las prefs del back en las filas', () => {
    const rows = component.filteredRows();
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.name === 'soul')?.enabled).toBe(false);
  });

  it('guarda las filas decididas (no los defaults)', () => {
    component.setEnabled('gem', false);
    component.setRank('gem', 1);
    component.save();

    const prefs = upserted[0]![0] as { model_name: string; enabled: boolean; favorite_rank: number }[];
    const byName = new Map(prefs.map((p) => [p.model_name, p]));
    expect(byName.get('gem')).toEqual({
      model_name: 'gem',
      enabled: false,
      recommend_tags: [],
      metadata: {},
      favorite_rank: 1,
    });
    // soul ya venía desactivada en el back: se reenvía para no perderla.
    expect(byName.get('soul')?.enabled).toBe(false);
    expect(component.dirty()).toBe(false);
  });

  it('marca y desmarca etiquetas predefinidas con checks', () => {
    expect(component.predefinedTags()).toContain('eficiente');
    component.toggleRecommendTag('gem', 'eficiente', true);
    expect(component.filteredRows().find((r) => r.name === 'gem')?.recommendTags).toEqual([
      'eficiente',
    ]);
    component.toggleRecommendTag('gem', 'EFICIENTE', false);
    expect(component.filteredRows().find((r) => r.name === 'gem')?.recommendTags).toEqual([]);
    expect(component.dirty()).toBe(true);
  });

  it('acepta una o varias etiquetas personalizadas separadas por coma', () => {
    component.addCustomTags('gem', 'top, barato , ,TOP');
    const row = component.filteredRows().find((r) => r.name === 'gem');
    expect(row?.recommendTags).toEqual(['top', 'barato']);
    expect(component.dirty()).toBe(true);
  });

  it('filtra por estado y por proveedor', () => {
    component.statusFilter.set('inactive');
    expect(component.filteredRows().map((r) => r.name)).toEqual(['soul']);
    component.statusFilter.set('active');
    expect(component.filteredRows().map((r) => r.name)).toEqual(['gem']);
    component.statusFilter.set('all');
    component.providerFilter.set('higgsfield');
    expect(component.filteredRows().length).toBe(2);
    component.providerFilter.set('otro');
    expect(component.filteredRows().length).toBe(0);
  });

  it('agrega y quita pares de metadata', () => {
    const key = { value: 'costo' } as HTMLInputElement;
    const value = { value: 'bajo' } as HTMLInputElement;
    component.addMeta('gem', key, value);
    expect(component.filteredRows().find((r) => r.name === 'gem')?.metadata).toEqual({
      costo: 'bajo',
    });
    expect(key.value).toBe('');
    component.removeMeta('gem', 'costo');
    expect(component.filteredRows().find((r) => r.name === 'gem')?.metadata).toEqual({});
  });

  it('guarda etiquetas y metadata', () => {
    component.addCustomTags('gem', 'top');
    const key = { value: 'nota' } as HTMLInputElement;
    const value = { value: 'interna' } as HTMLInputElement;
    component.addMeta('gem', key, value);
    component.save();

    const prefs = upserted[0]![0] as {
      model_name: string;
      recommend_tags: string[];
      metadata: Record<string, string>;
    }[];
    const gem = prefs.find((p) => p.model_name === 'gem');
    expect(gem?.recommend_tags).toEqual(['top']);
    expect(gem?.metadata).toEqual({ nota: 'interna' });
  });
});
