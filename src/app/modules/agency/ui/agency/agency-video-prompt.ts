/**
 * Prompt directo del clip de una escena (inmobiliaria y cine) para modelos de
 * video como Seedance 2.5.
 *
 * Un modelo de video no necesita el contexto comercial ni el ángulo de venta:
 * necesita saber qué verá, corte por corte. El formato es:
 *
 *   Escena N, duración X segundos.
 *   Toma @image1 (storyboard) como referencia lógica de la secuencia...
 *   Viñeta 1 (primer corte), duración Y segundos: @image2 (foto) plano..., cámara...
 *
 * La duración se reparte EQUITATIVAMENTE: duración del clip / cantidad de
 * viñetas (4 viñetas en 10 s = 2,5 s cada una; 4 en 8 s = 2 s).
 *
 * Sin dependencias de Angular: es la parte del flujo que se prueba sola.
 */

export interface ClipVinheta {
  tipo_toma?: string;
  que_se_ve?: string;
  movimiento_camara?: string;
  /** Nombre del archivo de la foto que respalda la viñeta. */
  foto_referencia?: string;
}

export interface ClipImageRef {
  /** `@imageN`: el mismo número con el que viaja al modelo. */
  tag: string;
  filename: string;
}

export interface SceneClipInput {
  sceneNumber: number;
  /** Duración de este clip en segundos. */
  duration: number;
  /** Hoja de storyboard adjunta (@image1) o null si no hay. */
  board: ClipImageRef | null;
  references: ClipImageRef[];
  vinetas: ClipVinheta[];
  /** Viñetas del clip completo: se reparten entre segmentos si hay varios. */
  segmentIndex?: number;
  segmentCount?: number;
  /** Etiquetas del usuario (opcional, al final). */
  tags?: string;
  /** Línea de especificación (duración, aspecto, calidad, sonido). */
  specLine?: string;
}

const ORDINAL_CUTS = [
  'primer corte',
  'segundo corte',
  'tercer corte',
  'cuarto corte',
  'quinto corte',
  'sexto corte',
  'séptimo corte',
  'octavo corte',
  'noveno corte',
  'décimo corte',
  'undécimo corte',
  'duodécimo corte',
];

/** Segundos en español: 2.5 → "2,5", 2 → "2". */
export function formatSeconds(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** Rango [inicio, fin) de viñetas del segmento `index` de `count` (reparto contiguo). */
export function segmentRange(length: number, index: number, count: number): [number, number] {
  if (count <= 1 || length === 0) return [0, length];
  const start = Math.min(Math.floor((index * length) / count), length - 1);
  const end = Math.max(Math.floor(((index + 1) * length) / count), start + 1);
  return [start, Math.min(end, length)];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.[a-z0-9]+$/, '');
}

/** Foto de la viñeta: la que nombra el experto o, sin nombre, la siguiente en rotación. */
function referenceForVinheta(
  vinheta: ClipVinheta,
  position: number,
  references: ClipImageRef[],
): ClipImageRef | null {
  if (references.length === 0) return null;
  const wanted = normalizeName(vinheta.foto_referencia ?? '');
  if (wanted) {
    const match = references.find((ref) => {
      const name = normalizeName(ref.filename);
      return name === wanted || name.includes(wanted) || wanted.includes(name);
    });
    if (match) return match;
  }
  return references[position % references.length];
}

function cleanSentence(text: string): string {
  return text.trim().replace(/[.\s]+$/, '');
}

/** Prompt de un clip (o de un segmento del clip) de la escena. */
export function composeSceneClipPrompt(input: SceneClipInput): string {
  const segmentCount = input.segmentCount ?? 1;
  const [start, end] = segmentRange(input.vinetas.length, input.segmentIndex ?? 0, segmentCount);
  const vinetas = input.vinetas.slice(start, end);
  const perCut = input.duration / Math.max(vinetas.length, 1);
  const cutSeconds = formatSeconds(perCut);

  const lines: string[] = [
    `Escena ${input.sceneNumber}, duración ${formatSeconds(input.duration)} segundos.`,
  ];
  if (input.board) {
    lines.push(
      `Toma la imagen ${input.board.tag} (${input.board.filename}) como referencia lógica de la secuencia de cortes y encuadres del clip. El estilo de lápiz del dibujo no aparece en el video; las fotos reales mandan sobre la apariencia.`,
    );
  } else if (input.references.length > 0) {
    lines.push('Las fotos reales adjuntas mandan sobre la apariencia de cada espacio.');
  }

  vinetas.forEach((vineta, i) => {
    const ref = referenceForVinheta(vineta, start + i, input.references);
    const cut = ORDINAL_CUTS[i] ?? `corte ${i + 1}`;
    const what = [vineta.tipo_toma, vineta.que_se_ve]
      .map((part) => cleanSentence(part ?? ''))
      .filter((part) => part !== '')
      .join(', ');
    const camera = cleanSentence(vineta.movimiento_camara ?? '');
    const body = [what, camera ? `cámara: ${camera}` : ''].filter((p) => p !== '').join('. ');
    lines.push(
      `Viñeta ${i + 1} (${cut}), duración ${cutSeconds} segundos: ${
        ref ? `${ref.tag} (${ref.filename}) ` : ''
      }${body}.`,
    );
  });

  if (segmentCount > 1) {
    lines.push(
      `Segmento ${(input.segmentIndex ?? 0) + 1} de ${segmentCount}: continuidad directa con el segmento anterior, misma luz y misma apariencia.`,
    );
  }
  lines.push('Sin texto en pantalla, sin letreros, sin subtítulos.');
  if (input.tags?.trim()) lines.push(`Tags de referencia: ${input.tags.trim()}`);
  if (input.specLine) lines.push(input.specLine);
  return lines.join('\n');
}


/** Reparte una duración nueva en partes iguales entre las viñetas de un prompt
 *  directo; si el texto no tiene ese formato, lo devuelve igual. */
export function rescaleClipDurations(text: string, duration: number): string {
  const cuts = text.match(/^Viñeta \d+ \([^)]*\), duración [\d,.]+ segundos:/gm);
  if (!cuts?.length) return text;
  const each = formatSeconds(duration / cuts.length);
  return text
    .replace(/^(Escena \d+, duración )[\d,.]+( segundos\.)/m, `$1${formatSeconds(duration)}$2`)
    .replace(/^(Viñeta \d+ \([^)]*\), duración )[\d,.]+( segundos:)/gm, `$1${each}$2`);
}