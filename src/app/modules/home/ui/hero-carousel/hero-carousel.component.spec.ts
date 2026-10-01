import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HeroCarouselComponent } from './hero-carousel.component';
import { HERO_SLIDES } from './hero-slides';

@Component({
  template: `<app-hero-carousel [slides]="slides" />`,
  imports: [HeroCarouselComponent],
})
class HeroCarouselHostComponent {
  readonly slides = [
    { type: 'image' as const, src: 'a.jpg', alt: 'A' },
    { type: 'image' as const, src: 'b.jpg', alt: 'B' },
  ];
}

describe('HeroCarouselComponent', () => {
  let fixture: ComponentFixture<HeroCarouselHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroCarouselHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HeroCarouselHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function carousel(): HeroCarouselComponent {
    return fixture.debugElement
      .query(By.directive(HeroCarouselComponent))
      .injector.get(HeroCarouselComponent);
  }

  it('expone los slides configurados con la primera diapositiva activa', () => {
    expect(HERO_SLIDES.length).toBeGreaterThan(0);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.hero-slide').length).toBe(2);
    expect(el.querySelector('.hero-slide-active img')?.getAttribute('src')).toBe('a.jpg');
  });

  it('navega por dots y marca aria-current', () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelectorAll('.hero-dot')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(carousel()['index']()).toBe(1);
    expect(el.querySelector('.hero-slide-active img')?.getAttribute('src')).toBe('b.jpg');
    expect(el.querySelectorAll('.hero-dot')[1]?.getAttribute('aria-current')).toBe('true');
  });
});
