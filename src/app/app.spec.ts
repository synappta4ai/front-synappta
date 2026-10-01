import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
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
    const headline = compiled.querySelector('h1')?.textContent ?? '';
    expect(headline).toContain('Hacemos que');
    expect(headline).toContain('las ideas');
    expect(headline).toContain('conecten');
    expect(compiled.querySelector('header img')?.getAttribute('alt')).toContain('Synappta');
    expect(text).toContain('Prueba nuestro estudio de creación con IA');
    expect(text).toContain('Escríbenos');
  });
});
