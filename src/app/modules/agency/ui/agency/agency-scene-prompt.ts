/**
 * Artefacto `scene_prompts` del PASO 1 comercial (`docs/agente-comercial.md`)
 * y su lectura como "plan de escena": la locación, los personajes, el producto
 * y los beats que el experto escribió, listos para armar el prompt del video.
 *
 * Sin dependencias de Angular: acá vive lo que se prueba solo. La traducción
 * de los textos de cada sección queda en el componente.
 */

import type { PhotoKind } from './agency-photos';

/** Beat del prompt de escena (fases Weston/Mamet del experto). */
export interface SceneBeat {
  momento?: number;
  verbo?: string;
  accion_fisica?: string;
  microgesto?: string;
  dialogo?: string;
  importancia?: string;
}

/** Un prompt de escena del artefacto del paso 1. */
export interface ScenePromptArtifact {
  id?: string;
  titulo?: string;
  resumen_para_usuario?: string;
  mensaje_marca?: string;
  locacion?: string;
  personajes?: string[];
  producto_en_escena?: string;
  modo?: string;
  registro?: string;
  beats?: SceneBeat[];
}

/** Tipo de referencia visual que pide un slot del prompt. */
export type SceneSlotKind = 'location' | 'character' | 'product';

/** Lugar del prompt donde el usuario debe insertar un tag de referencia. */
export interface ScenePromptSlot {
  kind: SceneSlotKind;
  /** Qué foto poner, en palabras del experto. */
  description: string;
}

/** Beat ya narrado, con su diálogo aparte. */
export interface ScenePromptBeat {
  action: string;
  dialogue: string;
}

export interface ScenePromptPlan {
  title: string;
  summary: string;
  location: ScenePromptSlot | null;
  characters: ScenePromptSlot[];
  product: ScenePromptSlot | null;
  beats: ScenePromptBeat[];
  camera: { mode: string; registro: string };
  marca: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Narración de un beat: verbo — acción física (microgesto). */
export function beatAction(beat: SceneBeat): string {
  const base = [text(beat.verbo), text(beat.accion_fisica)]
    .filter((part) => part !== '')
    .join(' — ');
  const gesture = text(beat.microgesto);
  return [base, gesture ? `(${gesture})` : ''].filter((part) => part !== '').join(' ');
}

/** Valor que no pide una foto (equivalente a "ninguno/ninguna/sin X"). */
function isEmptyValue(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === '' || normalized.startsWith('ningun') || normalized === 'sin';
}

/**
 * Artefacto del paso 1 → plan de escena. Tolerante a basura: sin artefacto
 * devuelve null y el componente se queda con el texto plano del prompt.
 */
export function planScenePrompt(
  artifact: ScenePromptArtifact | null | undefined,
): ScenePromptPlan | null {
  if (!artifact) {
    return null;
  }
  const personajes = (Array.isArray(artifact.personajes) ? artifact.personajes : [])
    .map(text)
    .filter((part) => part !== '');
  const beats = (Array.isArray(artifact.beats) ? artifact.beats : [])
    .filter((beat): beat is SceneBeat => !!beat && typeof beat === 'object')
    .map((beat) => ({ action: beatAction(beat), dialogue: text(beat.dialogo) }))
    .filter((beat) => beat.action !== '' || beat.dialogue !== '');
  const locacion = text(artifact.locacion);
  const producto = text(artifact.producto_en_escena);
  return {
    title: text(artifact.titulo),
    summary: text(artifact.resumen_para_usuario),
    location: isEmptyValue(locacion) ? null : { kind: 'location', description: locacion },
    characters: personajes.map((part) => ({ kind: 'character', description: part })),
    product: isEmptyValue(producto) ? null : { kind: 'product', description: producto },
    beats,
    camera: { mode: text(artifact.modo), registro: text(artifact.registro) },
    marca: text(artifact.mensaje_marca),
  };
}

/** Valor de un slot ya renderizado en el prompt (placeholder o tag). */
export interface PromptSlotText {
  kind: SceneSlotKind;
  value: string;
}

export interface SlotRange {
  start: number;
  end: number;
}

/** Tipo de foto → slot donde encaja. Props no tiene slot en el artefacto. */
export function slotKindForPhoto(
  kind: PhotoKind | null | undefined,
): SceneSlotKind | null {
  switch (kind) {
    case 'character':
    case 'location':
    case 'product':
      return kind;
    default:
      return null;
  }
}

function occurrences(text: string, value: string): SlotRange[] {
  const ranges: SlotRange[] = [];
  let from = 0;
  while (value !== '') {
    const start = text.indexOf(value, from);
    if (start === -1) {
      break;
    }
    ranges.push({ start, end: start + value.length });
    from = start + value.length;
  }
  return ranges;
}

/**
 * Rango del primer slot del prompt que corresponde al tipo de la foto.
 * Prioriza el slot bajo el cursor; si no, el primer placeholder libre.
 * Si ya no quedan placeholders (todos tienen tag) reasigna el primero.
 */
export function slotRangeForKind(
  text: string,
  kind: PhotoKind | null | undefined,
  slots: readonly PromptSlotText[],
  caret?: number,
): SlotRange | null {
  const target = slotKindForPhoto(kind);
  if (!target) {
    return null;
  }
  const candidates = slots
    .filter((slot) => slot.kind === target && slot.value !== '')
    .flatMap((slot) =>
      occurrences(text, slot.value).map((range) => ({
        ...range,
        assigned: slot.value.trim().startsWith('@'),
      })),
    );

  if (caret !== undefined) {
    const underCaret = candidates.find(
      (range) => caret >= range.start && caret <= range.end,
    );
    if (underCaret) {
      return { start: underCaret.start, end: underCaret.end };
    }
  }

  const pending = candidates.find((range) => !range.assigned);
  if (pending) {
    return { start: pending.start, end: pending.end };
  }
  const first = candidates[0];
  return first ? { start: first.start, end: first.end } : null;
}
