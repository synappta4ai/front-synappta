import { AfterViewInit, Directive, ElementRef, HostListener, inject } from '@angular/core';

/** Tope de altura (px) antes de dejar scroll interno en el textarea. */
const MAX_HEIGHT = 320;

/**
 * Textarea que crece con su contenido: al montarse (carga inicial, prompts
 * recién armados) y en cada tecla ajusta la altura al scrollHeight para que
 * el texto completo se vea sin scroll interno hasta MAX_HEIGHT.
 *
 * Nota: [ngModel] escribe el valor en un microtask posterior al primer ciclo
 * de detección, por lo que medir en ngAfterViewInit (síncrono) vería un
 * textarea vacío. Se difiere al siguiente frame para medir el contenido real.
 */
@Directive({
  selector: 'textarea[appAutogrow]',
})
export class AutogrowDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  ngAfterViewInit(): void {
    requestAnimationFrame(() => this.resize());
  }

  @HostListener('input')
  onInput(): void {
    this.resize();
  }

  /** Cubre escrituras programáticas del valor (ngModel change externo). */
  @HostListener('change')
  onChange(): void {
    this.resize();
  }

  private resize(): void {
    const el = this.el.nativeElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT)}px`;
  }
}
