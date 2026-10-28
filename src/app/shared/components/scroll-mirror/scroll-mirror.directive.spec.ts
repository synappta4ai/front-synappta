import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ScrollMirrorDirective } from './scroll-mirror.directive';

@Component({
  template: `
    <div #mirror class="mirror" aria-hidden="true">{{ text }}</div>
    <textarea [appScrollMirror]="mirror"></textarea>
  `,
  imports: [ScrollMirrorDirective],
})
class ScrollMirrorHostComponent {
  text = 'Prompt largo';
}

describe('ScrollMirrorDirective', () => {
  let fixture: ComponentFixture<ScrollMirrorHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScrollMirrorHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ScrollMirrorHostComponent);
    fixture.detectChanges();
  });

  function parts(): { host: HTMLTextAreaElement; mirror: HTMLElement } {
    const host = fixture.debugElement.query(By.directive(ScrollMirrorDirective))
      .nativeElement as HTMLTextAreaElement;
    const mirror = (fixture.nativeElement as HTMLElement).querySelector('.mirror') as HTMLElement;
    return { host, mirror };
  }

  it('copia el scroll del textarea en el espejo', () => {
    const { host, mirror } = parts();
    host.scrollTop = 180;
    host.scrollLeft = 4;
    host.dispatchEvent(new Event('scroll'));

    expect(mirror.scrollTop).toBe(180);
    expect(mirror.scrollLeft).toBe(4);
  });

  it('re-alinea el espejo cuando se reescribe su contenido', async () => {
    const { host, mirror } = parts();
    host.scrollTop = 200;
    host.dispatchEvent(new Event('scroll'));
    expect(mirror.scrollTop).toBe(200);

    // [innerHTML] reescribe los hijos del espejo: su scroll vuelve a 0.
    mirror.replaceChildren(document.createTextNode('Prompt reescrito'));
    mirror.scrollTop = 0;
    await Promise.resolve();

    expect(mirror.scrollTop).toBe(200);
  });
});
