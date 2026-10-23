import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { provideTranslateService } from '@ngx-translate/core';

import { environment } from '@env/environment';

import { AiModel } from '../../interfaces';
import { ModelSelectComponent } from './model-select.component';

const base = environment.API_URL;

function model(
  name: string,
  modality: AiModel['modality'],
  ratios: string[],
  provider: AiModel['credential_provider'] = 'gemini',
  maxReferences = 0,
): AiModel {
  return {
    name,
    display_name: name,
    modality,
    generator: 'x',
    credential_provider: provider,
    base_url: 'https://example.test',
    endpoint: '/x',
    gallery_sync: false,
    ...(maxReferences > 0 ? { max_references: maxReferences } : {}),
    defaults: { ratios },
  };
}

/** Estado protegido que el test necesita leer. */
interface Internals {
  filtered: () => readonly AiModel[];
  control: FormControl<string>;
}

const imageCatalog: AiModel[] = [
  model('higgsfield-soul-2-standard', 'image', ['1:1', '3:2', '16:9'], 'higgsfield'),
  model('higgsfield-recraft-4-1', 'image', ['1:1', '16:9'], 'higgsfield'),
  model('gemini-3-pro-image-preview', 'image', ['1:1', '3:2', '4:3'], 'gemini', 14),
  model('dola-seedream-5-0-pro-260628', 'image', ['1:1', '16:9'], 'gemini', 10),
];

/** Pantalla con dos selectores de distinta modalidad en el mismo formulario. */
@Component({
  imports: [ModelSelectComponent, ReactiveFormsModule],
  template: `
    <form [formGroup]="form">
      <app-model-select modality="text" formControlName="text" inputId="text-model" />
      <app-model-select modality="image" formControlName="image" inputId="image-model" />
    </form>
  `,
})
class FormHostComponent {
  readonly form = new FormGroup({
    text: new FormControl('', { nonNullable: true }),
    image: new FormControl('', { nonNullable: true }),
  });
}

describe('ModelSelectComponent', () => {
  let fixture: ComponentFixture<ModelSelectComponent>;
  let httpMock: HttpTestingController;
  let internals: Internals;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ModelSelectComponent);
    internals = fixture.componentInstance as unknown as Internals;
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Carga el catálogo de imagen y deja el componente estable. */
  async function loadImages(data: AiModel[] = imageCatalog): Promise<void> {
    fixture.detectChanges();
    httpMock.expectOne(`${base}/models/image`).flush({ success: true, message: 'success', data });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lista la modalidad pedida y filtra por relación de aspecto', async () => {
    fixture.componentRef.setInput('ratio', '3:2');
    const picked: string[] = [];
    fixture.componentInstance.selectionChange.subscribe((model) => {
      if (model) {
        picked.push(model.name);
      }
    });

    await loadImages();

    // Soul 2 y Gemini declaran 3:2; Recraft y Seedream no entran.
    expect(picked).toEqual(['higgsfield-soul-2-standard']);
    expect(internals.filtered().map((m) => m.name)).toEqual([
      'higgsfield-soul-2-standard',
      'gemini-3-pro-image-preview',
    ]);
  });

  it('acota por nombres cuando la herramienta usa un modelo concreto', async () => {
    fixture.componentRef.setInput('names', ['gemini-3-pro-image-preview']);
    await loadImages();

    expect(internals.filtered().map((m) => m.name)).toEqual(['gemini-3-pro-image-preview']);
  });

  it('filtra por proveedor de credenciales', async () => {
    fixture.componentRef.setInput('provider', 'higgsfield');
    await loadImages();

    expect(internals.filtered().map((m) => m.name)).toEqual([
      'higgsfield-soul-2-standard',
      'higgsfield-recraft-4-1',
    ]);
  });

  it('sólo lista modelos que aceptan imágenes de referencia', async () => {
    fixture.componentRef.setInput('requiresReferences', true);
    await loadImages();

    expect(internals.filtered().map((m) => m.name)).toEqual([
      'gemini-3-pro-image-preview',
      'dola-seedream-5-0-pro-260628',
    ]);
    // La selección automática cae en el primero que sí acepta referencias.
    expect(internals.control.value).toBe('gemini-3-pro-image-preview');
  });

  it('respeta el valor escrito desde el formulario', async () => {
    fixture.componentRef.setInput('autoSelect', false);
    await loadImages();

    fixture.componentInstance.writeValue('dola-seedream-5-0-pro-260628');
    fixture.detectChanges();

    expect(internals.control.value).toBe('dola-seedream-5-0-pro-260628');
  });

  it('junta dos modalidades para un mismo selector', async () => {
    fixture.componentRef.setInput('modality', ['text', 'image']);
    fixture.detectChanges();

    httpMock.expectOne(`${base}/models/text`).flush({
      success: true,
      message: 'success',
      data: [model('claude-text', 'text', [])],
    });
    httpMock
      .expectOne(`${base}/models/image`)
      .flush({ success: true, message: 'success', data: imageCatalog });
    await fixture.whenStable();

    expect(internals.filtered().length).toBe(5);
  });
});

describe('ModelSelectComponent en un formulario reactivo', () => {
  let fixture: ComponentFixture<FormHostComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormHostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FormHostComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('cada selector escribe su modalidad en el control del formulario', async () => {
    fixture.detectChanges();

    httpMock
      .expectOne(`${base}/models/text`)
      .flush({ success: true, message: 'success', data: [model('claude-text', 'text', [])] });
    httpMock
      .expectOne(`${base}/models/image`)
      .flush({ success: true, message: 'success', data: imageCatalog });
    await fixture.whenStable();

    // Dos modalidades en la misma pantalla: un solo select por tipo, cada uno
    // con el primer modelo de su catálogo.
    expect(fixture.componentInstance.form.value).toEqual({
      text: 'claude-text',
      image: 'higgsfield-soul-2-standard',
    });
  });
});
