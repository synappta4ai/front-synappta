import {
  AiModel,
  ComposeTarget,
  DcsAnalyze,
  DcsShot,
  IngredientRole,
} from '@modules/agency/interfaces';

/** Insumo adjunto al botón único de imágenes del producto y audio. */
export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'audio' | 'video';
  /** Miniatura (imágenes) o URL del archivo. */
  url: string;
  /** Rol del insumo de imagen; el audio siempre es audio. */
  role?: IngredientRole;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|oga|opus|aiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|avi)$/i;

/** Clasifica un archivo por mime y, si falta, por extensión (.mp3, .wav, .flac...). */
export function attachmentKind(file: Pick<File, 'type' | 'name'>): 'image' | 'audio' | 'video' | null {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  return null;
}

/** Roles de las imágenes para el paso 2 (audio siempre se resuelve en el back). */
export function buildImageRoles(list: readonly Attachment[]): Record<string, IngredientRole> {
  const roles: Record<string, IngredientRole> = {};
  for (const item of list) {
    if (item.kind !== 'image') continue;
    roles[item.id] = item.role === 'person' ? 'person' : 'product';
  }
  return roles;
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

/** Fila de la ficha técnica (etiqueta traducida + valor ya formateado). */
export interface TechRow {
  label: string;
  value: string;
}

/** Grupo de la ficha técnica (Cámara, Lente, Luz...). */
export interface TechGroup {
  key: string;
  label: string;
  rows: readonly TechRow[];
}

type TranslateFn = (key: string) => string;

const i18nKey = (key: string): string => `VIDEOMACHINE.${key}`;

/** Une valores omitiendo vacíos. */
export function joinValues(
  values: readonly (string | number | null | undefined)[],
  sep = ' · ',
): string {
  return values
    .map((v) => (typeof v === 'number' ? String(v) : (v ?? '').toString().trim()))
    .filter((v) => v.length > 0)
    .join(sep);
}

/** Distribución "static ×12 (60%)" de las listas del skill. */
export function formatDistribution(
  list: readonly Record<string, string | number | undefined>[] | undefined,
  countKey: string,
  shareKey: string,
): string {
  if (!list?.length) return '';
  return list
    .map((item) => {
      const name = joinValues([item['type'], item['shot_size'], item['angle_vertical']]);
      const count = item[countKey];
      const share = item[shareKey];
      const parts = [name];
      if (typeof count === 'number') parts.push(`×${count}`);
      if (typeof share === 'number') parts.push(`(${Math.round(share)}%)`);
      return parts.filter(Boolean).join(' ');
    })
    .join(' · ');
}

function techRow(
  t: TranslateFn,
  key: string,
  value: string | number | null | undefined,
): TechRow | null {
  const text = typeof value === 'number' ? String(value) : (value ?? '').toString().trim();
  return text.length > 0 ? { label: t(i18nKey(key)), value: text } : null;
}

function techGroup(
  key: string,
  t: TranslateFn,
  rows: readonly (TechRow | null)[],
): TechGroup | null {
  const cleaned = rows.filter((row): row is TechRow => !!row);
  return cleaned.length > 0 ? { key, label: t(i18nKey(key)), rows: cleaned } : null;
}

/** Secciones técnicas del desglose DCS; vacío si el análisis no lo trae. */
export function dcsTechGroups(
  dcs: DcsAnalyze | null | undefined,
  t: TranslateFn,
): readonly TechGroup[] {
  if (!dcs) return [];
  const sig = dcs.technical_signature ?? {};
  const camera = dcs.camera_summary ?? {};
  const edit = dcs.editing_style ?? {};
  const metrics = edit.metrics ?? {};
  const grade = sig.color_grade_overall ?? {};
  const light = sig.lighting_overall ?? {};
  const trans = dcs.transitions_summary ?? {};
  const visual = dcs.visual_style ?? {};

  const groups: readonly (TechGroup | null)[] = [
    techGroup('TECH_CAMERA', t, [
      techRow(t, 'TECH_DOMINANT_MOVEMENT', camera.dominant_movement),
      techRow(
        t,
        'TECH_STATIC_SHARE',
        typeof camera.static_share_pct === 'number'
          ? `${Math.round(camera.static_share_pct)}%`
          : undefined,
      ),
      techRow(t, 'TECH_STABILIZATION', camera.stabilization_overall),
      techRow(
        t,
        'TECH_MOVEMENT_DIST',
        formatDistribution(camera.movement_distribution, 'count', 'runtime_share_pct'),
      ),
      techRow(
        t,
        'TECH_SIZE_DIST',
        formatDistribution(camera.shot_size_distribution, 'count', 'runtime_share_pct'),
      ),
      techRow(
        t,
        'TECH_ANGLE_DIST',
        formatDistribution(camera.angle_distribution, 'count', 'runtime_share_pct'),
      ),
      techRow(t, 'TECH_CAMERA_PERSONALITY', camera.camera_personality),
    ]),
    techGroup('TECH_LENS', t, [
      techRow(t, 'TECH_LENS_FAMILY', sig.lens_family),
      techRow(t, 'TECH_DOF', sig.dof_overall),
      techRow(t, 'TECH_BOKEH', sig.bokeh_overall),
      techRow(t, 'TECH_MOTION_BLUR', sig.motion_blur_overall),
      techRow(t, 'TECH_GRAIN', sig.grain_overall),
      techRow(t, 'TECH_SHARPNESS', sig.sharpness_overall),
      techRow(t, 'TECH_FRAME_FEEL', sig.frame_rate_feel_overall),
      techRow(
        t,
        'TECH_ARTIFACTS',
        joinValues(
          (sig.optical_artifacts_overall ?? []).map((a) => joinValues([a.id, a.severity])),
        ),
      ),
    ]),
    techGroup('TECH_LIGHT', t, [
      techRow(t, 'TECH_KEY', sig.key_overall),
      techRow(t, 'TECH_EXPOSURE', sig.exposure_overall),
      techRow(
        t,
        'TECH_WB',
        typeof sig.white_balance_overall_k === 'number'
          ? `${sig.white_balance_overall_k} K`
          : undefined,
      ),
      techRow(t, 'TECH_LIGHT_SETUP', joinValues(light.setup ?? [])),
      techRow(t, 'TECH_LIGHT_KEY_DIR', light.key_direction),
      techRow(t, 'TECH_LIGHT_QUALITY', light.quality),
      techRow(t, 'TECH_PALETTE', joinValues(grade.palette_hex ?? [])),
      techRow(t, 'TECH_TEMPERATURE', grade.temperature_bias),
      techRow(t, 'TECH_SATURATION', grade.saturation),
      techRow(t, 'TECH_LOOK', joinValues(grade.look ?? [])),
    ]),
    techGroup('TECH_EDIT', t, [
      techRow(t, 'TECH_EDIT_PRIMARY', edit.primary),
      techRow(t, 'TECH_EDIT_SECONDARY', joinValues(edit.secondary ?? [])),
      techRow(
        t,
        'TECH_METRICS',
        joinValues([
          metrics.shot_count !== undefined
            ? `${metrics.shot_count} ${t(i18nKey('TECH_METRICS_SHOTS'))}`
            : undefined,
          metrics.cut_count !== undefined
            ? `${metrics.cut_count} ${t(i18nKey('TECH_METRICS_CUTS'))}`
            : undefined,
          metrics.average_shot_length_s !== undefined
            ? `${metrics.average_shot_length_s} s ${t(i18nKey('TECH_METRICS_ASL'))}`
            : undefined,
          metrics.cuts_per_second !== undefined
            ? `${metrics.cuts_per_second} ${t(i18nKey('TECH_METRICS_CPS'))}`
            : undefined,
          metrics.micro_shot_count !== undefined
            ? `${metrics.micro_shot_count} ${t(i18nKey('TECH_METRICS_MICRO'))}`
            : undefined,
        ]),
      ),
      techRow(t, 'TECH_PACE', metrics.pace_class),
      techRow(
        t,
        'TECH_BEAT_SYNC',
        typeof metrics.beat_sync_ratio === 'number'
          ? `${Math.round(metrics.beat_sync_ratio * 100)}%`
          : undefined,
      ),
      techRow(t, 'TECH_CONTINUITY', joinValues(edit.continuity_devices ?? [])),
    ]),
    techGroup('TECH_TRANSITIONS', t, [
      techRow(
        t,
        'TECH_TRANSITION_DIST',
        (trans.distribution ?? [])
          .map((d) => joinValues([d.type, typeof d.count === 'number' ? `×${d.count}` : undefined]))
          .join(' · '),
      ),
      techRow(t, 'TECH_TRANSITION_SIGNATURE', trans.signature_transition),
      techRow(t, 'TECH_TRANSITION_NOTES', trans.notes),
    ]),
    techGroup(
      'TECH_EFFECTS',
      t,
      (dcs.effects_summary ?? []).map((effect) =>
        techRow(
          t,
          'TECH_EFFECT_ROW',
          joinValues([
            effect.name,
            typeof effect.count === 'number' ? `×${effect.count}` : undefined,
            effect.purpose,
          ]),
        ),
      ),
    ),
    techGroup('TECH_VISUAL', t, [
      techRow(t, 'TECH_MEDIUM', visual.medium),
      techRow(t, 'TECH_FORMAT', visual.format),
      techRow(t, 'TECH_AESTHETICS', joinValues(visual.aesthetics ?? [])),
      techRow(t, 'TECH_TIER', visual.production_tier),
      techRow(t, 'TECH_CAPTURE', visual.capture_device_guess),
    ]),
  ];
  return groups.filter((group): group is TechGroup => !!group);
}

/** Ficha técnica de una toma concreta. */
export function dcsShotRows(shot: DcsShot | null | undefined, t: TranslateFn): readonly TechRow[] {
  if (!shot) return [];
  const movement = shot.camera_movement ?? {};
  const lens = shot.lens ?? {};
  const dof = shot.depth_of_field ?? {};
  const light = shot.lighting ?? {};
  const exposure = shot.exposure_and_color ?? {};
  const transition = shot.transition_out ?? {};
  const product = shot.product_visible ?? {};
  const rows: readonly (TechRow | null)[] = [
    techRow(t, 'TECH_SHOT_SIZE', shot.shot_size),
    techRow(t, 'TECH_ANGLE', shot.angle_vertical),
    techRow(t, 'TECH_ANGLE_H', shot.angle_horizontal),
    techRow(t, 'TECH_MOVEMENT', movement.type),
    techRow(t, 'TECH_MOVEMENT_DIR', joinValues([movement.direction, movement.speed], ' / ')),
    techRow(t, 'TECH_EVIDENCE', movement.evidence),
    techRow(t, 'TECH_LENS_FAMILY', lens.class),
    techRow(t, 'TECH_FOCAL', lens.focal_length_estimate_mm),
    techRow(t, 'TECH_DOF', joinValues([dof.dof, dof.focus_target], ' · ')),
    techRow(t, 'TECH_BOKEH', joinValues([dof.bokeh_shape, dof.bokeh_quality], ' · ')),
    techRow(t, 'TECH_LIGHT_SETUP', light.setup),
    techRow(t, 'TECH_LIGHT_KEY_DIR', light.key_direction),
    techRow(t, 'TECH_LIGHT_QUALITY', light.quality),
    techRow(
      t,
      'TECH_EXPOSURE',
      joinValues([exposure.exposure, exposure.key, exposure.contrast], ' · '),
    ),
    techRow(
      t,
      'TECH_WB',
      typeof exposure.white_balance_k === 'number' ? `${exposure.white_balance_k} K` : undefined,
    ),
    techRow(t, 'TECH_PALETTE', joinValues(exposure.palette_hex ?? [])),
    techRow(t, 'TECH_EFFECTS_LIST', joinValues((shot.effects ?? []).map((e) => e.name))),
    techRow(t, 'TECH_TRANSITION', joinValues([transition.type, transition.evidence], ' · ')),
    techRow(t, 'TECH_SUBJECT', shot.subject_action),
    techRow(
      t,
      'TECH_PRODUCT_VISIBLE',
      product.visible === false
        ? t(i18nKey('TECH_NO'))
        : joinValues([product.piece, product.how_shown], ' · '),
    ),
    techRow(t, 'TECH_PURPOSE', shot.shot_purpose),
    techRow(
      t,
      'TECH_REPLICABILITY',
      joinValues([shot.replicability?.rating, shot.replicability?.notes], ' · '),
    ),
    techRow(t, 'TECH_CONFIDENCE', shot.confidence),
  ];
  return rows.filter((row): row is TechRow => !!row);
}

/** Fichas por índice de toma, para la tabla colapsable. */
export function dcsShotRowsByIndex(
  dcs: DcsAnalyze | null | undefined,
  t: TranslateFn,
): ReadonlyMap<number, readonly TechRow[]> {
  const map = new Map<number, readonly TechRow[]>();
  (dcs?.shots ?? []).forEach((shot, i) => {
    const index = typeof shot.index === 'number' ? shot.index : i + 1;
    map.set(index, dcsShotRows(shot, t));
  });
  return map;
}
