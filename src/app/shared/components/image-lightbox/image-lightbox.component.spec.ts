import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageLightboxService } from '@services/image-lightbox.service';

import { ImageLightboxComponent } from './image-lightbox.component';

describe('ImageLightboxComponent', () => {
  let fixture: ComponentFixture<ImageLightboxComponent>;
  let service: ImageLightboxService;
  const cleanups: HTMLElement[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImageLightboxComponent],
      providers: [provideTranslateService()],
    });
    fixture = TestBed.createComponent(ImageLightboxComponent);
    service = TestBed.inject(ImageLightboxService);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const element of cleanups.splice(0)) {
      element.remove();
    }
    fixture.destroy();
    service.close();
  });

  function thumbnail(container: HTMLElement, attrs: Record<string, string> = {}): HTMLImageElement {
    const image = document.createElement('img');
    for (const [key, value] of Object.entries(attrs)) {
      image.setAttribute(key, value);
    }
    image.src = '/api/v1/t/acme/files/abc/thumbnail';
    image.getBoundingClientRect = () => ({
      width: 200,
      height: 150,
      top: 0,
      left: 0,
      right: 200,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    container.appendChild(image);
    document.body.appendChild(container);
    cleanups.push(container);
    return image;
  }

  it('opens the viewer when an inert thumbnail is clicked', () => {
    const container = document.createElement('div');
    thumbnail(container).click();

    expect(service.image()?.src).toContain('/serve');
  });

  it('keeps the action of thumbnails that are already controls', () => {
    const button = document.createElement('button');
    thumbnail(button).click();

    expect(service.image()).toBeNull();
  });

  it('respects the data-no-lightbox opt-out', () => {
    const container = document.createElement('div');
    thumbnail(container, { 'data-no-lightbox': '' }).click();

    expect(service.image()).toBeNull();
  });

  it('uses data-full-src when present', () => {
    const container = document.createElement('div');
    thumbnail(container, { 'data-full-src': '/full/resolution.png' }).click();

    expect(service.image()?.src).toContain('/full/resolution.png');
  });
});
