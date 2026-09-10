type Props = {
  base64: string;
  fileName?: string;
  contentType: 'application/pdf';
};

/**
 * Descarga un archivo desde base64
 * * Por defecto soporta pdf, pero se puede configurar para soportar otros tipos de archivos
 *
 * @example
 * ```typescript
 * const base64 = 'SGVsbG8gd29ybGQ=';
 * downloadBase64File({ base64 });
 * ```
 *
 * @param props Props del archivo
 * @returns void
 */
export const downloadBase64File = (props: Props): void => {
  const { base64, contentType = 'application/pdf', fileName } = props;

  const element = window.document.createElement('a');
  element.href = `data:${contentType};base64,${base64}`;
  element.download = fileName ?? 'default';
  return element.click();
};

/**
 * Descarga un archivo desde un blob
 *
 * @example
 * ```typescript
 * const blob = new Blob(['Hello world'], { type: 'text/plain' });
 * downloadBlob({ blob });
 * ```
 *
 * @param props Props del archivo
 * @returns void
 */
export const downloadFileFromBlob = (blob: Blob, filename?: string): void => {
  const url = URL.createObjectURL(blob);
  const element = window.document.createElement('a');
  element.href = url;
  element.download = filename ?? 'default';
  return element.click();
};
