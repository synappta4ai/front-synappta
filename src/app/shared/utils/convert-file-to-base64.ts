import { Base64 } from '@interfaces/common';

/**
 * Convierte un archivo a base64
 *
 * @example
 * ```typescript
 * const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
 * const base64 = await convertFileToBase64(file);
 * console.log(base64);
 * ```
 *
 * @param file Archivo a convertir
 * @returns Promise<Base64>
 */
export const convertFileToBase64 = (file: File): Promise<Base64> => {
  const base: Base64 = {
    name: file.name,
    mimeType: file.type,
    base64: '',
  };
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onloadend = () => {
      if (reader.result && typeof reader.result === 'string') {
        base.base64 = reader.result.split(',')[1];

        return resolve(base);
      }
    };

    reader.onerror = (error) => reject(error);
  });
};
