import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SlidePillDirective } from './slide-pill.directive';

@Component({
  template: `
    <div appSlidePill=".seg-btn">
      <button class="seg-btn active" type="button">A</button>
      <button class="seg-btn" type="button">B</button>
    </div>
  `,
  imports: [SlidePillDirective],
})
class SlidePillHostComponent {}

/** Items command-only: la marca activa vive en el ancestro (ej. <li> del menubar). */
@Component({
  template: `
    <div appSlidePill=".seg-btn" activeParentClass="tools-active" activeParentSelector=".seg-item">
      <span class="seg-item"><button class="seg-btn" type="button">A</button></span>
      <span class="seg-item tools-active"><button class="seg-btn" type="button">B</button></span>
    </div>
  `,
  imports: [SlidePillDirective],
})
class SlidePillParentHostComponent {}

describe('SlidePillDirective', () => {
  let fixture: ComponentFixture<SlidePillHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SlidePillHostComponent, SlidePillParentHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(SlidePillHostComponent);
    fixture.detectChanges();
  });

  function hostDebug() {
    const debug = fixture.debugElement.query(By.directive(SlidePillDirective));
    expect(debug).toBeTruthy();
    return debug;
  }

  function directive(): SlidePillDirective {
    const instance = hostDebug()?.injector.get(SlidePillDirective);
    expect(instance).toBeTruthy();
    return instance as SlidePillDirective;
  }

  function hostElement(): HTMLElement {
    return hostDebug().nativeElement as HTMLElement;
  }

  it('creates the directive', () => {
    expect(directive()).toBeTruthy();
  });

  it('creates a .seg-pill child and stays inert without measurable layout (jsdom fallback)', () => {
    directive().refresh();
    const host = hostElement();
    expect(host.querySelector('.seg-pill')).toBeTruthy();
    // jsdom reporta offsetWidth 0: no añade seg-on y no rompe.
    expect(host.classList.contains('seg-on')).toBe(false);
    expect(() => directive().refresh()).not.toThrow();
    expect(host.classList.contains('seg-on')).toBe(false);
  });

  it('treats the parent-marked item as active (menubar command-only)', () => {
    const parentFixture = TestBed.createComponent(SlidePillParentHostComponent);
    parentFixture.detectChanges();

    const host = parentFixture.debugElement.query(
      By.directive(SlidePillDirective),
    ).nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLElement>('.seg-btn');
    expect(buttons.length).toBe(2);
    const target = buttons[1]!;
    Object.defineProperty(target, 'offsetWidth', { value: 120, configurable: true });
    Object.defineProperty(target, 'offsetHeight', { value: 36, configurable: true });
    Object.defineProperty(target, 'offsetLeft', { value: 8, configurable: true });
    Object.defineProperty(target, 'offsetTop', { value: 4, configurable: true });

    const instance = parentFixture.debugElement
      .query(By.directive(SlidePillDirective))
      .injector.get(SlidePillDirective);
    instance.refresh();

    const pill = host.querySelector<HTMLElement>('.seg-pill');
    expect(pill?.style.transform).toContain('translate(8px, 4px)');
    parentFixture.destroy();
  });

  it('positions the pill and adds seg-on once items are measurable', () => {
    const host = hostElement();
    const active = host.querySelector<HTMLElement>('.seg-btn.active');
    expect(active).toBeTruthy();
    if (!active) {
      return;
    }
    Object.defineProperty(active, 'offsetWidth', { value: 120, configurable: true });
    Object.defineProperty(active, 'offsetHeight', { value: 36, configurable: true });
    Object.defineProperty(active, 'offsetLeft', { value: 8, configurable: true });
    Object.defineProperty(active, 'offsetTop', { value: 4, configurable: true });

    directive().refresh();

    const pill = host.querySelector<HTMLElement>('.seg-pill');
    expect(pill).toBeTruthy();
    expect(host.classList.contains('seg-on')).toBe(true);
    expect(pill?.style.width).toBe('120px');
    expect(pill?.style.height).toBe('36px');
    expect(pill?.style.transform).toContain('translate(8px, 4px)');
  });
});
