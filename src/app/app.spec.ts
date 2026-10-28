import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { App } from './app';
import { routes } from './app.routes';

const HOME_ES = {
  CONTACT: 'Contáctanos',
  HERO_TITLE_A: 'Deja de pelear con la IA,',
  HERO_TITLE_B_LEAD: 'empieza a',
  HERO_TITLE_B: 'dirigir',
  HERO_SUB: 'Basta de tener 50 pestañas abiertas.',
  HERO_CTA: 'Quiero dirigir mi video',
  STEPS: {
    IDEA: 'Idea',
    IDEA_DESC: 'Escribe una frase.',
    SCENE: 'Escena',
    SCENE_DESC: 'Crea personajes.',
    VIDEO: 'Video',
    VIDEO_DESC: 'Genera y descarga.',
  },
  TAGS: 'Comerciales · Miniseries',
  FINAL_A: 'No necesitas permiso',
  FINAL_B: 'ni ser un experto,',
  FINAL_C: 'Solo una idea.',
  FINAL_CTA: 'Escribe aquí',
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideTranslateService()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('es', { HOME: HOME_ES });
    translate.use('es');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the home page on the default route', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const text = (compiled.textContent ?? '').replace(/\s+/g, ' ');
    const headline = (compiled.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ');
    expect(headline).toContain('Deja de pelear con la IA,');
    expect(headline).toContain('dirigir');
    expect(compiled.querySelector('header img')?.getAttribute('alt')).toContain('Synappta');
    expect(text).toContain('Quiero dirigir mi video');
    expect(text).toContain('No necesitas permiso');
  });
});
