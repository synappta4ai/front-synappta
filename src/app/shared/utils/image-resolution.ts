/** Preferred image tiers: 2K first, then the highest available. */
export const IMAGE_RESOLUTION_PREFERENCE: readonly string[] = [
  '2K',
  '4K',
  '1080p',
  '1K',
  '720p',
  '480p',
];

/**
 * Resolution to request for an image generation.
 *
 * Images feed video generation, so 2K is the target. Models that don't
 * declare 2K fall back to the highest tier they support (1080p, 1K, ...).
 * Returns null when the model doesn't expose resolution tiers.
 */
export function preferredImageResolution(
  resolutions: readonly string[] | null | undefined,
): string | null {
  const supported = resolutions ?? [];
  return IMAGE_RESOLUTION_PREFERENCE.find((r) => supported.includes(r)) ?? supported[0] ?? null;
}
