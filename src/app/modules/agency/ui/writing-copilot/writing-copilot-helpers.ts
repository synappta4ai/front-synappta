import type { PhotoKind } from '../agency/agency-photos';

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

/** Insumo subido en el paso de prompts (aún sin etiqueta). */
export interface CopilotAsset {
  id: string;
  name: string;
  kind: CopilotAssetKind;
  role: CopilotAssetRole;
  /** Miniatura o URL del archivo (vacía para audio). */
  url: string;
}

/** Insumo con su etiqueta @ImageN / @VideoN / @AudioN. */
export interface TaggedAsset extends CopilotAsset {
  tag: string;
}

const PREFIX: Record<CopilotAssetKind, string> = { image: 'Image', video: 'Video', audio: 'Audio' };

/** Asigna etiquetas por tipo, en el orden en que se subieron. */
export function tagAssets(assets: readonly CopilotAsset[]): readonly TaggedAsset[] {
  const counters: Record<CopilotAssetKind, number> = { image: 0, video: 0, audio: 0 };
  return assets.map((asset) => {
    counters[asset.kind] += 1;
    return { ...asset, tag: `@${PREFIX[asset.kind]}${counters[asset.kind]}` };
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
 * Mapa etiqueta → tipo de recurso para pintar el prompt final. Solo las
 * imágenes llevan rol; audio y video los resuelve el resaltador por el tag.
 */
export function promptKinds(assets: readonly TaggedAsset[]): ReadonlyMap<string, PhotoKind | null> {
  const kinds = new Map<string, PhotoKind | null>();
  for (const asset of assets) {
    if (asset.kind !== 'image') continue;
    const tone: PhotoKind = asset.role === 'person' ? 'character' : asset.role === 'environment' ? 'location' : 'product';
    kinds.set(asset.tag.toLowerCase(), tone);
  }
  return kinds;
}

/** Mensaje que pide el prompt final en inglés con las referencias tagueadas. */
export const FINAL_PROMPT_INSTRUCTION =
  'Traducí al inglés los prompts anteriores, incluidos los rótulos (LOCACIÓN → LOCATION, REFERENCIAS → REFERENCES, Movimiento → Movement, Velocidad → Speed, Encuadre → Framing, Lente y foco → Lens and focus, Luz y color → Light and colour, Actuación → Acting, Diálogo → Dialogue, Transición → Transition, EVITAR → AVOID), e integrá las referencias con sus etiquetas (@Image1, @Video1, @Audio1...). Devolvé solo el prompt final listo para generar el video, sin comentarios ni supuestos.';
