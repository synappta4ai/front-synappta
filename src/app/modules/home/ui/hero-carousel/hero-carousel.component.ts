import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { animate, type AnimationPlaybackControls } from 'motion';

import type { HeroSlide } from './hero-slides';

const DEFAULT_DURATION = 6500;
const VIDEO_FALLBACK_DURATION = 15000;
const DRAG_THRESHOLD = 80;
const FLICK_VELOCITY = 0.4;

/**
 * Carrusel multimedia del hero: pista deslizante con springs, arrastre
 * con puntero (touch + mouse), autoplay discreto consciente de video
 * (espera al fin o respeta `duration`) y dots amarillos.
 * Se pausa con hover, pestaña oculta o prefers-reduced-motion.
 */
@Component({
  selector: 'app-hero-carousel',
  templateUrl: './hero-carousel.component.html',
  styleUrl: './hero-carousel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroCarouselComponent implements OnDestroy {
  readonly slides = input.required<readonly HeroSlide[]>();
  readonly intervalMs = input(DEFAULT_DURATION);

  protected readonly index = signal(0);
  protected readonly dragging = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private slideAnimation: AnimationPlaybackControls | null = null;
  private dragStartX = 0;
  private dragBaseX = 0;
  private dragLastX = 0;
  private dragLastT = 0;

  constructor() {
    afterNextRender(() => {
      if (!this.browser || this.reducedMotion()) {
        return;
      }
      document.addEventListener('visibilitychange', this.onVisibility);
      this.activate(0);
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.slideAnimation?.stop();
    if (this.browser) {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  protected goTo(i: number): void {
    const count = this.slides().length;
    this.activate(((i % count) + count) % count);
  }

  protected stepSlide(direction: 1 | -1): void {
    this.goTo(this.index() + direction);
  }

  protected onArrow(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      this.stepSlide(-1);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.stepSlide(1);
      event.preventDefault();
    }
  }

  protected onDown(event: PointerEvent): void {
    if (!this.browser || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    this.clearTimer();
    this.dragging.set(true);
    this.dragStartX = event.clientX;
    this.dragLastX = event.clientX;
    this.dragLastT = event.timeStamp;
    this.dragBaseX = -this.index() * this.unit();
    this.slideAnimation?.stop();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // jsdom/tests: el arrastre se trackea igual con los listeners.
    }
  }

  protected onMove(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    const dx = event.clientX - this.dragStartX;
    this.setX(this.dragBaseX + dx);
    const now = event.timeStamp;
    if (now !== this.dragLastT) {
      this.dragLastX = event.clientX;
      this.dragLastT = now;
    }
  }

  protected onUp(event: PointerEvent): void {
    if (!this.dragging()) {
      return;
    }
    this.dragging.set(false);
    const dx = event.clientX - this.dragStartX;
    const dt = Math.max(1, event.timeStamp - this.dragLastT);
    const velocity = (event.clientX - this.dragLastX) / dt;
    if (Math.abs(velocity) > FLICK_VELOCITY) {
      this.goTo(this.index() + (velocity < 0 ? 1 : -1));
    } else if (Math.abs(dx) > DRAG_THRESHOLD) {
      this.goTo(this.index() + (dx < 0 ? 1 : -1));
    } else {
      this.goTo(this.index());
    }
  }

  protected pause(): void {
    this.clearTimer();
    this.pauseVideos();
  }

  protected resume(): void {
    if (!this.browser || this.reducedMotion() || document.hidden) {
      return;
    }
    this.activate(this.index());
  }

  private activate(i: number): void {
    this.index.set(i);
    this.clearTimer();
    this.renderPosition(true);
    if (!this.browser || this.reducedMotion()) {
      this.pauseVideos(i);
      return;
    }
    const slide = this.slides()[i];
    const video = this.videoAt(i);
    this.pauseVideos(i);
    if (slide?.type === 'video' && video) {
      this.playVideo(video);
      if (slide.duration) {
        this.later(slide.duration);
      } else {
        video.onended = () => this.goTo(i + 1);
        this.later(VIDEO_FALLBACK_DURATION);
      }
    } else {
      this.later(slide?.duration ?? this.intervalMs());
    }
  }

  private renderPosition(animated: boolean): void {
    const strip = this.strip()?.nativeElement;
    if (!strip) {
      return;
    }
    const x = -this.index() * this.unit();
    this.slideAnimation?.stop();
    if (!animated || this.reducedMotion() || typeof strip.animate !== 'function') {
      strip.style.transform = `translateX(${x}px)`;
      return;
    }
    this.slideAnimation = animate(strip, { x }, { type: 'spring', stiffness: 260, damping: 32 });
  }

  private setX(x: number): void {
    const strip = this.strip()?.nativeElement;
    if (strip) {
      strip.style.transform = `translateX(${x}px)`;
    }
  }

  private unit(): number {
    const strip = this.strip()?.nativeElement;
    return strip?.clientWidth || 0;
  }

  private later(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => this.goTo(this.index() + 1), ms);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private videos(): HTMLVideoElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll('video'));
  }

  private videoAt(i: number): HTMLVideoElement | null {
    const videos = this.videos();
    const videosBefore = this.slides()
      .slice(0, i)
      .filter((s) => s.type === 'video').length;
    return videos[videosBefore] ?? null;
  }

  private playVideo(video: HTMLVideoElement): void {
    try {
      const result = video.play() as unknown;
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
    } catch {
      // Autoplay bloqueado: el timer/fallback avanza igual.
    }
  }

  private pauseVideos(exceptSlide?: number): void {
    this.slides().forEach((slide, i) => {
      if (slide.type === 'video' && i !== exceptSlide) {
        this.videoAt(i)?.pause();
      }
    });
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  };

  private reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
