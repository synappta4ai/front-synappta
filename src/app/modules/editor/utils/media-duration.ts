/**
 * Mide la duración de un video/audio cargando solo sus metadatos. Solo corre en
 * el navegador. Devuelve 0 si no se pudo leer (error, formato no soportado o
 * tiempo agotado).
 */
export function probeDuration(
  url: string,
  kind: 'video' | 'audio',
  timeoutMs = 20_000,
): Promise<number> {
  if (typeof document === 'undefined') {
    return Promise.resolve(0);
  }
  return new Promise<number>((resolve) => {
    const el = document.createElement(kind);
    let done = false;
    const finish = (value: number): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      resolve(Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : 0);
    };
    const timer = setTimeout(() => finish(0), timeoutMs);
    el.preload = 'metadata';
    el.onloadedmetadata = () => finish(el.duration);
    el.onerror = () => finish(0);
    el.src = url;
  });
}
