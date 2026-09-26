import { Pipe, PipeTransform, inject } from '@angular/core';

import { environment } from '@env/environment';

/**
 * Prefixes a server-relative path (e.g. /outputs/video/x.mp4) with the API
 * server origin, producing an absolute URL the <video>/<img> tags can load.
 * Absolute URLs (http...) pass through untouched; empty values return ''.
 *
 * The API origin is derived from environment.apiUrl by stripping its /api/v1
 * suffix, so dev/prod environments resolve automatically.
 */
@Pipe({ name: 'serverUrl' })
export class ServerUrlPipe implements PipeTransform {
  private readonly origin = environment.apiUrl.replace(/\/api\/v1\/?$/, '');

  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    const path = value.startsWith('/') ? value : `/${value}`;
    return `${this.origin}${path}`;
  }
}
