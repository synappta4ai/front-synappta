import { AiModel, ComposeTarget } from '@modules/agency/interfaces';

/** Insumo adjunto al botón único de imágenes del producto y audio. */
export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'audio';
  /** Miniatura (imágenes) o URL del archivo. */
  url: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|aiff?)$/i;

/** Clasifica un archivo por mime y, si falta, por extensión (.mp3, .wav, .flac...). */
export function attachmentKind(file: Pick<File, 'type' | 'name'>): 'image' | 'audio' | null {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  return null;
}

const DEFAULT_MAX_DURATION = 15;

/** Límites del modelo de video elegido, en el formato que espera el back. */
export function buildTarget(model: AiModel): ComposeTarget {
  const durations = [...(model.defaults?.durations ?? [])].sort((a, b) => a - b);
  const name = model.name.toLowerCase();
  return {
    model: model.name,
    max_duration: durations.length > 0 ? durations[durations.length - 1]! : DEFAULT_MAX_DURATION,
    durations,
    ratios: model.defaults?.ratios ?? [],
    resolutions: model.defaults?.resolutions ?? [],
    // Seedance 2.0 y OpenRouter envían la bandera de audio; el resto la ignora.
    supports_audio: /seedance-2-0/.test(name) || model.credential_provider === 'openrouter',
    // Solo la familia Seedance acepta audio como referencia real.
    audio_reference: name.includes('seedance'),
    max_references: model.max_references ?? 0,
  };
}

/** Los tags @ImageN / @AudioN del prompt se escriben como los espera el modelo: [Image N]. */
export function promptForGeneration(text: string): string {
  return text
    .replace(/@Image(\d+)/gi, '[Image $1]')
    .replace(/@Audio(\d+)/gi, '[Audio $1]')
    .trim();
}

/** Duración permitida más cercana por debajo (sin pasar del máximo). */
export function snapDuration(wanted: number, allowed: readonly number[], max: number): number {
  let value = Math.max(1, Math.round(wanted));
  if (max > 0 && value > max) value = max;
  if (allowed.length === 0) return value;
  const fits = allowed.filter((d) => d <= value && (max <= 0 || d <= max));
  if (fits.length > 0) return Math.max(...fits);
  return Math.min(...allowed);
}
