import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TiltDirective } from './tilt.directive';

@Component({
  template: `<div appTilt class="card">Contenido</div>`,
  imports: [TiltDirective],
})
class TiltHostComponent {}

describe('TiltDirective', () => {
  let fixture: ComponentFixture<TiltHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TiltHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(TiltHostComponent);
    fixture.detectChanges();
  });

  it('aplica la clase tilt sin romper en jsdom (sin matchMedia)', () => {
    const el = fixture.debugElement.query(By.directive(TiltDirective)).nativeElement as HTMLElement;
    expect(el.classList.contains('tilt')).toBe(true);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 }));
    expect(el.style.transform).toBe('');
  });
});
