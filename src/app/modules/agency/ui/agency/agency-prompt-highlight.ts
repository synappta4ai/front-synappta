/**
 * Resaltado del prompt comercial: parte el texto en segmentos con el tono de
 * su tipo de recurso (personaje, locación, props, producto) para pintarlo en
 * el editor. Los tags `@nombre` toman el color de la foto; un tag que no
 * corresponde a ninguna foto subida se marca como desconocido.
 *
 * Sin dependencias de Angular: es la parte del flujo que se prueba sola.
 */

import type { PhotoKind } from './agency-photos';

/** Tono visual de un fragmento del prompt. */
export type PromptTone =
  | 'plain'
  | 'character'
  | 'location'
  | 'props'
  | 'product'
  | 'unknown';

/** Fragmento del prompt con su tono. */
export interface PromptSegment {
  text: string;
  tone: PromptTone;
}

/** Valor de un slot del artefacto ya renderizado en el prompt. */
export interface PromptSlotSpan {
  value: string;
  tone: 'character' | 'location' | 'product';
}

/** Tag de referencia dentro del texto (mismo criterio que parseTagsFromText). */
const TAG_PATTERN = /@[a-z0-9][a-z0-9-]*/gi;

interface Match {
  start: number;
  end: number;
  tone: PromptTone;
}

function toneForTag(tag: string, kinds: ReadonlyMap<string, PhotoKind | null>): PromptTone {
  const key = tag.toLowerCase();
  if (kinds.has(key)) {
    return kinds.get(key) ?? 'unknown';
  }
  // Los tags posicionales del flujo anterior no tienen tipo de foto: no son
  // un error, se dejan con el color normal del texto.
  return /^@image\d+$/.test(key) ? 'plain' : 'unknown';
}

/** Tags con su posición; descarta un `@` pegado a una palabra (emails). */
function tagMatches(
  text: string,
  kinds: ReadonlyMap<string, PhotoKind | null>,
): Match[] {
  const matches: Match[] = [];
  for (const match of text.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const previous = start > 0 ? text[start - 1] : '';
    if (previous && /[\w@]/.test(previous)) {
      continue;
    }
    matches.push({
      start,
      end: start + match[0].length,
      tone: toneForTag(match[0], kinds),
    });
  }
  return matches;
}

function merge(segments: PromptSegment[]): PromptSegment[] {
  const out: PromptSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) {
      continue;
    }
    const previous = out[out.length - 1];
    if (previous && previous.tone === segment.tone) {
      previous.text += segment.text;
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

/**
 * Texto → segmentos coloreados. Los valores de `slots` (locación, cada
 * personaje, producto) conservan su tono; los tags presentes en el texto se
 * pintan según el tipo de su foto. El resto queda como `plain`.
 */
export function highlightPrompt(
  text: string,
  slots: readonly PromptSlotSpan[],
  kinds: ReadonlyMap<string, PhotoKind | null>,
): PromptSegment[] {
  if (!text) {
    return [];
  }
  const spans = slots
    .filter((slot) => slot.value.length > 0)
    .sort((a, b) => b.value.length - a.value.length);
  const tags = tagMatches(text, kinds);
  const segments: PromptSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let next: Match | null = null;
    for (const span of spans) {
      const start = text.indexOf(span.value, cursor);
      if (start === -1) {
        continue;
      }
      const end = start + span.value.length;
      if (!next || start < next.start || (start === next.start && end > next.end)) {
        next = { start, end, tone: span.tone };
      }
    }
    const tag = tags.find((match) => match.start >= cursor);
    if (tag && (!next || tag.start < next.start)) {
      next = tag;
    }
    if (!next) {
      break;
    }
    if (next.start > cursor) {
      segments.push({ text: text.slice(cursor, next.start), tone: 'plain' });
    }
    segments.push({ text: text.slice(next.start, next.end), tone: next.tone });
    cursor = next.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), tone: 'plain' });
  }
  return merge(segments);
}
