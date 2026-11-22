import { describe, expect, it } from 'vitest';

import { preferredImageResolution } from './image-resolution';

describe('preferredImageResolution', () => {
  it('picks 2K when the model supports it', () => {
    expect(preferredImageResolution(['1K', '2K', '4K'])).toBe('2K');
    expect(preferredImageResolution(['720p', '1080p', '2K'])).toBe('2K');
  });

  it('falls back to the highest tier when 2K is missing', () => {
    expect(preferredImageResolution(['720p', '1080p'])).toBe('1080p');
    expect(preferredImageResolution(['720p'])).toBe('720p');
    expect(preferredImageResolution(['1K'])).toBe('1K');
  });

  it('returns null when the model exposes no tiers', () => {
    expect(preferredImageResolution([])).toBeNull();
    expect(preferredImageResolution(null)).toBeNull();
    expect(preferredImageResolution(undefined)).toBeNull();
  });
});
