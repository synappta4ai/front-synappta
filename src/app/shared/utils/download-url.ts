import { downloadFileFromBlob } from './download-file-from-base4';

/**
 * Descarga un archivo remoto por URL.
 *
 * Intenta traerlo como blob (mismo origen o con CORS habilitado); si el
 * navegador lo bloquea, abre la URL en una pestaña nueva para guardar con
 * clic derecho. Seguro en SSR: solo corre en handlers de usuario.
 */
export async function downloadRemoteFile(url: string, filename?: string): Promise<void> {
  if (!url) {
    return;
  }
  try {
    // `no-store` evita leer de caché una respuesta guardada sin cabeceras
    // CORS (p.ej. cuando la misma URL se abrió antes como imagen/navegación),
    // lo que haría fallar el fetch con "No Access-Control-Allow-Origin".
    const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const fallback = url.split('?')[0].split('/').pop() || 'descarga';
    downloadFileFromBlob(blob, filename || decodeURIComponent(fallback));
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
