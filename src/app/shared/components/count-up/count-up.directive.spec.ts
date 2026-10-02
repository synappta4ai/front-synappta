import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CountUpDirective } from './count-up.directive';

@Component({
  template: `<span [appCountUp]="value()" [appCountUpSuffix]="suffix()">0</span>`,
  imports: [CountUpDirective],
})
class CountUpHostComponent {
  readonly value = signal(0);
  readonly suffix = signal('');
}

describe('CountUpDirective', () => {
  let fixture: ComponentFixture<CountUpHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CountUpHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(CountUpHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function text(): string {
    return (
      (
        fixture.debugElement.query(By.directive(CountUpDirective)).nativeElement as HTMLElement
      ).textContent?.trim() ?? ''
    );
  }

  it('escribe el valor inicial y respeta el sufijo', async () => {
    expect(text()).toBe('0');
    fixture.componentInstance.suffix.set('+');
    fixture.componentInstance.value.set(9);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();
    expect(text()).toBe('9+');
  });
});
