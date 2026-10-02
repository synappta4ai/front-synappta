import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ImgFadeDirective } from './img-fade.directive';

@Component({
  template: `<img appImgFade src="a.jpg" alt="A" />`,
  imports: [ImgFadeDirective],
})
class ImgFadeHostComponent {}

describe('ImgFadeDirective', () => {
  let fixture: ComponentFixture<ImgFadeHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ImgFadeHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(ImgFadeHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('parte oculta y se revela al cargar', () => {
    const el = fixture.debugElement.query(By.directive(ImgFadeDirective))
      .nativeElement as HTMLElement;
    expect(el.classList.contains('img-fade')).toBe(true);
    el.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(el.classList.contains('img-fade-on')).toBe(true);
  });
});
