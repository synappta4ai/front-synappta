import type { PromptTone } from '../agency/agency-prompt-highlight';

/** Trozo de la respuesta del agente: prosa o bloque de prompt. */
export interface WritingSegment {
  code: boolean;
  content: string;
}

const FENCE = /```[^\n]*\n?([\s\S]*?)```/g;

/**
 * Parte el Markdown del agente en segmentos de prosa y bloques de código, en el
 * orden original. Los bloques se recortan; los segmentos vacíos se descartan y
 * el texto de las vallas no se muestra.
 */
export function splitFences(text: string): readonly WritingSegment[] {
  const segments: WritingSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((match = FENCE.exec(text)) !== null) {
    const prose = text.slice(last, match.index).trim();
    if (prose) segments.push({ code: false, content: prose });
    const code = (match[1] ?? '').trim();
    if (code) segments.push({ code: true, content: code });
    last = match.index + match[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) segments.push({ code: false, content: tail });
  return segments;
}

/** Tipo de insumo del agente Writing Copilot. */
export type CopilotAssetKind = 'image' | 'video' | 'audio';

/** Rol de una imagen (persona, producto o locación). */
export type CopilotAssetRole = 'person' | 'product' | 'environment';

/** Insumo subido en el paso 1 (aún sin etiqueta). */
export interface CopilotAsset {
  id: string;
  name: string;
  kind: CopilotAssetKind;
  role: CopilotAssetRole;
  /** Miniatura o URL del archivo (vacía para audio). */
  url: string;
  /** Ingrediente de la biblioteca donde quedó archivado (personaje/locación/prop). */
  ingredientId?: string;
}

/** Insumo con su etiqueta de prompt (@nombre-del-archivo). */
export interface TaggedAsset extends CopilotAsset {
  tag: string;
}

const FALLBACK_PREFIX: Record<CopilotAssetKind, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
};

/**
 * Etiqueta de cada insumo: el NOMBRE DEL ARCHIVO con su extensión, porque así
 * el Estudio resuelve la mención y el generador sabe qué archivo usar. Si dos
 * archivos se llaman igual, el segundo lleva un sufijo numérico.
 */
export function tagAssets(assets: readonly CopilotAsset[]): readonly TaggedAsset[] {
  const used = new Map<string, number>();
  return assets.map((asset) => {
    const base = asset.name.trim() || FALLBACK_PREFIX[asset.kind];
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    if (count === 1) {
      return { ...asset, tag: '@' + base };
    }
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    return { ...asset, tag: '@' + stem + '-' + count + ext };
  });
}

/** Manifiesto de referencias que recibe el cerebro (una línea por insumo). */
export function buildReferences(assets: readonly TaggedAsset[]): string {
  return assets
    .map((asset) => {
      const name = asset.name.trim() ? ` "${asset.name.trim()}"` : '';
      if (asset.kind === 'video') {
        return `${asset.tag} = reference video clip${name}: camera work, framing and edit rhythm`;
      }
      if (asset.kind === 'audio') {
        return `${asset.tag} = audio reference${name}: soundtrack, rhythm and voice reference`;
      }
      switch (asset.role) {
        case 'person':
          return `${asset.tag} = identity reference: the on-screen person${name}`;
        case 'environment':
          return `${asset.tag} = environment reference: location and lighting${name}`;
        default:
          return `${asset.tag} = product: the user's product${name}`;
      }
    })
    .join('\n');
}

/**
 * Mapa etiqueta → tono de recurso para pintar el prompt final: personaje,
 * producto y locación por el rol de la imagen; audio y video por su tipo.
 */
export function promptKinds(assets: readonly TaggedAsset[]): ReadonlyMap<string, PromptTone> {
  const kinds = new Map<string, PromptTone>();
  for (const asset of assets) {
    const key = asset.tag.toLowerCase();
    if (asset.kind === 'video') {
      kinds.set(key, 'video');
      continue;
    }
    if (asset.kind === 'audio') {
      kinds.set(key, 'audio');
      continue;
    }
    const tone: PromptTone =
      asset.role === 'person' ? 'character' : asset.role === 'environment' ? 'location' : 'product';
    kinds.set(key, tone);
  }
  return kinds;
}

/** Mensaje que pide el prompt final en inglés con las referencias tagueadas. */
export const FINAL_PROMPT_INSTRUCTION =
  'Traducí al inglés los prompts anteriores, incluidos los rótulos (LOCACIÓN → LOCATION, REFERENCIAS → REFERENCES, Movimiento → Movement, Velocidad → Speed, Encuadre → Framing, Lente y foco → Lens and focus, Luz y color → Light and colour, Actuación → Acting, Diálogo → Dialogue, Transición → Transition, EVITAR → AVOID), e integrá las referencias con sus etiquetas (@nombre-de-archivo). Devolvé solo el prompt final listo para generar el video, sin comentarios ni supuestos.';

export interface PromptHeader {
  number: number;
  title: string;
  explicit: boolean;
}

const PROMPT_HEADER = /^\s*PROMPT\s+(\d+)\s*(?:de\s+(\d+))?\s*(?:\|[^|\n]*)?\|\s*(.+)$/i;
const SHOT_HEADER = /^\s*(?:PLANO|TOMA|ESCENA|SHOT)\s+(\d+)\s*[-\u2014\u2013|:]\s*(.+)$/i;
const ACTION_LINE = /^\s*(?:actuaci[o\u00f3]n|acting)\s*:\s*(.+)$/im;
const TITLE_LINE = /^\s*(?:t[i\u00ed]tulo|title)\s*:\s*(.+)$/im;

/** Explicit title line written by the skill (TÍTULO: / TITLE:). */
function explicitTitle(block: string): string | null {
  const match = TITLE_LINE.exec(block);
  if (!match) return null;
  const text = match[1].replace(/\s+/g, ' ').trim();
  return text ? text.toUpperCase() : null;
}

/** Non-empty lines without code fences. */
function promptLines(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('```'));
}

/** Fallback title: short first line, otherwise the beginning of the block. */
function fallbackTitle(lines: readonly string[]): string {
  const first = (lines[0] ?? '')
    .replace(/^#+\s*/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
  const isField = /^(BLOQUE|CONTINUITY|REFERENCIAS|REFERENCES|Aspecto|Continuidad|Formato)\b/i.test(
    first,
  );
  if (first && first.length <= 90 && !isField) return first;
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 90 ? text.slice(0, 87).trimEnd() + '\u2026' : text;
}

/** Action of the take, e.g. "LA NI\u00d1A ENCIENDE LA VELA". */
function actionTitle(block: string): string | null {
  const match = ACTION_LINE.exec(block);
  if (!match) return null;
  const clean = match[1]
    .replace(/^(?:o?bjetivo|objective)\s*:\s*/i, '')
    .replace(/@[\w.\-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence =
    clean
      .split(/(?<=[.!?])\s/)[0]
      ?.replace(/[.!?]+$/g, '')
      .trim() ?? '';
  if (!sentence) return null;
  const short = sentence.length > 70 ? sentence.slice(0, 67).trimEnd() + '\u2026' : sentence;
  return short.toUpperCase();
}

/** Prompt number and title; `fallbackNumber` is its global position. */
export function parsePromptHeader(block: string, fallbackNumber: number): PromptHeader {
  const lines = promptLines(block);
  const head = PROMPT_HEADER.exec(lines[0] ?? '');
  const shot = head ? null : SHOT_HEADER.exec(lines[0] ?? '');
  const number = head
    ? Number(head[1]) || fallbackNumber
    : shot
      ? Number(shot[1]) || fallbackNumber
      : fallbackNumber;
  const headerTitle = head ? (head[3] ?? '').trim() : shot ? (shot[2] ?? '').trim() : '';
  return {
    number,
    title: explicitTitle(block) ?? actionTitle(block) ?? (headerTitle || fallbackTitle(lines)),
    explicit: Boolean(head || shot),
  };
}

/** Split the final prompt into blocks, one per PROMPT n de N header. */
export function splitPromptText(text: string): { number: number; title: string; text: string }[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (PROMPT_HEADER.test(line)) starts.push(index);
  });
  if (starts.length === 0) return [];
  return starts.map((from, index) => {
    const to = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const block = lines.slice(from, to).join('\n').trim();
    const header = parsePromptHeader(block, index + 1);
    return { number: header.number, title: header.title, text: block };
  });
}
