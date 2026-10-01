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
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import type { HeroSlide } from './hero-slides';

const DEFAULT_DURATION = 6500;
const VIDEO_FALLBACK_DURATION = 15000;

/**
 * Carrusel multimedia del hero: autoplay discreto, consciente de video
 * (espera al fin o respeta `duration`), dots amarillos, swipe en mobile.
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

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private timer: ReturnType<typeof setTimeout> | null = null;
  private touchX: number | null = null;

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
    if (this.browser) {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  }

  protected goTo(i: number): void {
    const count = this.slides().length;
    this.activate(((i % count) + count) % count);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchX = event.touches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchX === null) {
      return;
    }
    const delta = (event.changedTouches[0]?.clientX ?? this.touchX) - this.touchX;
    this.touchX = null;
    if (Math.abs(delta) < 40) {
      return;
    }
    this.goTo(this.index() + (delta < 0 ? 1 : -1));
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
