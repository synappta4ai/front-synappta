import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RevealDirective } from './reveal.directive';

@Component({
  template: `<p appReveal>Texto</p>`,
  imports: [RevealDirective],
})
class RevealHostComponent {}

describe('RevealDirective', () => {
  let fixture: ComponentFixture<RevealHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RevealHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(RevealHostComponent);
    fixture.detectChanges();
  });

  it('creates the directive', () => {
    expect(fixture.debugElement.query(By.directive(RevealDirective))).toBeTruthy();
  });

  it('shows content when IntersectionObserver is unavailable (jsdom/SSR)', () => {
    const el = fixture.debugElement.query(By.directive(RevealDirective))
      .nativeElement as HTMLElement;
    expect(el.classList.contains('reveal')).toBe(false);
  });
});
