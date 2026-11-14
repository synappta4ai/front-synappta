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

const FALLBACK_PREFIX: Record<CopilotAssetKind, string> = { image: 'image', video: 'video', audio: 'audio' };

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
