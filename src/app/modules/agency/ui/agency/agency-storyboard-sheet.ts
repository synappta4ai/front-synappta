/**
 * Prompt final de la hoja de storyboard de /agency (inmobiliaria y cine).
 *
 * Adapta el motor de la herramienta Storyboard (`assets/tools/storyboard.system.md`):
 * las fotos de referencia son el ingrediente principal, el modelo de imagen
 * extrae su ADN visual y la hoja se dibuja con un estilo bloqueado. A
 * diferencia de la herramienta, aquí las viñetas van LIMPIAS: sin encabezados,
 * sin pie de texto, sin números ni leyendas. El Cerebro solo escribe los
 * beats ("Viñeta 1: ..."); la directiva, la cuadrícula y el manifiesto de
 * referencias los agrega esta función.
 *
 * Sin dependencias de Angular: es la parte del flujo que se prueba sola.
 */
import { PhotoKind, ReferenceImage } from './agency-photos';

export type BoardAgent = 'real_estate' | 'cinema' | 'commercial';

export interface BoardGrid {
  columns: number;
  rows: number;
}

/** Cuadrícula de la hoja según la cantidad de viñetas (hoja apaisada). */
export function boardGrid(count: number): BoardGrid {
  const n = Math.min(Math.max(Math.round(count) || 1, 1), 12);
  if (n === 1) return { columns: 1, rows: 1 };
  if (n === 2) return { columns: 2, rows: 1 };
  if (n === 3) return { columns: 3, rows: 1 };
  if (n === 4) return { columns: 2, rows: 2 };
  if (n <= 6) return { columns: 3, rows: 2 };
  if (n <= 8) return { columns: 4, rows: 2 };
  if (n === 9) return { columns: 3, rows: 3 };
  return { columns: 4, rows: 3 };
}

/** Etiqueta de la referencia en el manifiesto (CHARACTER / LOCATION / PROP).
 *  Sin tipo, la foto cuenta como lugar: es lo que sube la constructora. */
export function referenceLabel(kind: PhotoKind | undefined): 'CHARACTER' | 'LOCATION' | 'PROP' {
  if (kind === 'character') return 'CHARACTER';
  if (kind === 'props' || kind === 'product') return 'PROP';
  return 'LOCATION';
}

const PHASE_ONE: Record<'real_estate' | 'cinema', string> = {
  real_estate: [
    '# PHASE 1: DEEP REFERENCE EXTRACTION (PRIMARY INGREDIENT)',
    '',
    'The attached images are real photographs or sales renders supplied by the developer of the project. They are the only source of truth for how the project looks. Before reading the story beats, inspect every image and lock its immutable visual DNA:',
    '',
    '1. **Architecture (`[LOC_REF]`):** facade, number of floors, balconies, volumes, materials, colors, roofline, entrance canopies, and the exact shape of every tower or building.',
    '2. **Interior spaces (`[LOC_REF]`):** lobby layout, reception desk, ceiling, flooring, wall finishes, furniture, lighting fixtures, and amenities such as gym, pool, coworking, or meeting rooms.',
    '3. **Surroundings (`[LOC_REF]`):** gardens, paths, trees, street, mountains, skyline, and time of day or light direction.',
    '4. **People:** only draw people when a beat asks for them. Keep them natural, small in frame, never as the center of the shot, and never invent faces.',
    '',
    'Never invent architecture, materials, furniture, or amenities that are not visible in the references. When a beat names a space, draw the space exactly as it appears in the matching reference image.',
  ].join('\n'),
  cinema: [
    '# PHASE 1: DEEP REFERENCE EXTRACTION (PRIMARY INGREDIENT)',
    '',
    'Before processing the story beats, inspect the attached images and lock an immutable visual DNA:',
    '',
    '1. **Characters (`[CHAR_REF]`):** exact age, ethnicity, facial structure, facial hair, hairstyle, body type, and clothing with textures. Inject this literal description into every panel where the character appears.',
    '2. **Location (`[LOC_REF]`):** architecture, spatial layout, surfaces, lighting, furniture, and atmosphere. Place characters on real surfaces and walkable zones of that space.',
    '3. **Props (`[PROP_REF]`):** shape, relative scale, material, and graphic details so each object keeps its scale next to the characters.',
    '',
    'The reference manifest labels each image as CHARACTER, LOCATION, or PROP. If a label is missing, classify the image by its content.',
  ].join('\n'),
};

const COMMON_SECTIONS = [
  '# PHASE 2: CINEMATIC TRANSLATION AND DIRECTION',
  '',
  'Divide the story beats into the exact requested number of panels, one beat per panel, in order:',
  '',
  '- Follow the shot type written in each beat; when a beat gives none, assign a logical progression: extreme wide shot, wide shot, American shot, medium shot, close-up, or detail shot.',
  '- Follow the camera angle written in each beat; when none, choose eye-level, low-angle, high-angle, or over-the-shoulder.',
  '- One single action and one single camera movement per panel.',
  '',
  '# PHASE 3: IMMUTABLE VISUAL STYLE (STYLE LOCK)',
  '',
  '- **Technique:** traditional storyboard sketch in black graphite pencil and fine ink, soft cross-hatching shading, clean outlines, strictly monochromatic grayscale.',
  '- **Support:** off-white ivory paper background with a subtle grainy texture, with even gutters between panels.',
  '- **Anatomy of each cell:** only a clean 16:9 rectangle with a solid black border containing the drawing. No header, no caption, no footer lines, no panel numbers.',
  '',
  '# UNIVERSAL OPTIMIZATION FOR IMAGE MODELS',
  '',
  '- **No ambiguous pronouns:** never refer to "the same space" or "the same person" between panels. Repeat the key traits extracted in Phase 1 in every panel.',
  '- **Clear spatial coordinates:** the grid positions below are exact; fill each one with its beat.',
  '- **No text at all:** no words, letters, numbers, labels, signs, captions, logos, watermarks, or signatures anywhere on the sheet, including inside the drawings (blank signage only).',
  '- **No color:** grayscale only.',
  '- **Consistency:** keep 100% fidelity of architecture, finishes, characters, props, and lighting across all panels, based on the reference images.',
  '',
  '# FINAL OUTPUT',
  '',
  'Return only the finished storyboard sheet as an image. Do not return JSON, Markdown, code blocks, or explanatory text.',
].join('\n');

export interface BoardSheetInput {
  agent: BoardAgent;
  /** Beats del Cerebro (o la plantilla de respaldo): "Viñeta 1: ...". */
  beats: string;
  count: number;
  /** Relación de aspecto elegida en la modal ('' = hoja 3:2 por defecto). */
  ratio: string;
  references: ReferenceImage[];
  /** Descripción por referencia (mismo orden), p. ej. las sugerencias de la escena. */
  descriptions?: string[];
}

/** Prompt completo que se envía al modelo de imagen junto con las fotos. */
export function composeBoardSheetPrompt(input: BoardSheetInput): string {
  const count = Math.min(Math.max(Math.round(input.count) || 1, 1), 12);
  const grid = boardGrid(count);
  const phaseOne = input.agent === 'cinema' ? PHASE_ONE.cinema : PHASE_ONE.real_estate;
  const manifest =
    input.references.length === 0
      ? '- No reference images. Build the visual DNA from the story beats only.'
      : input.references
          .map((ref, i) => {
            const desc = (input.descriptions?.[i] ?? ref.note ?? '').trim();
            const label = referenceLabel(ref.kind);
            return `- Reference ${i + 1} [${label}]: ${ref.filename}${desc ? ` — ${desc}` : ''}`;
          })
          .join('\n');
  const positions: string[] = [];
  for (let row = 1; row <= grid.rows; row++) {
    for (let column = 1; column <= grid.columns && positions.length < count; column++) {
      positions.push(
        `- Panel ${positions.length + 1} (Row ${row}, Column ${column}): draw the matching beat inside a clean black-bordered 16:9 frame, with no text.`,
      );
    }
  }
  const sheet = input.ratio
    ? `Production sheet with aspect ratio ${input.ratio}`
    : 'Horizontal 3:2 production sheet';

  return [
    '# ROLE & OBJECTIVE',
    'You are the Cinematography Director and Multimodal Engine of a storyboard app. Analyze the attached reference images as your primary ingredient, combine them with the story beats, and render a master storyboard sheet. Keep absolute consistency in identity, structure, and style.',
    phaseOne,
    COMMON_SECTIONS,
    'STORY BEATS (one per panel, in reading order):',
    input.beats.trim(),
    'STORYBOARD SPEC:',
    `- ${sheet} with exactly ${count} panels.`,
    `- Grid layout: ${grid.columns} columns by ${grid.rows} rows. Reading order: left to right, top to bottom.`,
    ...positions,
    'REFERENCE MANIFEST (attached in this order):',
    manifest,
    'FINAL RENDER DIRECTIVE:',
    'Render the finished image now. Output only the image. Preserve the exact appearance of the reference images in every panel and keep the whole sheet free of any written text.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
