import {
  EDITOR_DEFAULT_IMAGE_SECONDS,
  EDITOR_MIN_CLIP_SECONDS,
  EditorAudioClip,
  EditorProject,
  EditorSource,
  EditorVideoClip,
} from '../interfaces';

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function createId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyProject(name = ''): EditorProject {
  return {
    version: 1,
    name,
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [
      { id: createId(), kind: 'text' },
      { id: createId(), kind: 'video' },
      { id: createId(), kind: 'audio' },
    ],
    assets: [],
    video: [],
    audio: [],
    texts: [],
  };
}

/** Pistas de un tipo, en orden (el índice es el `track` de sus clips). */
export function tracksOfKind(project: EditorProject, kind: 'video' | 'audio' | 'text'): number[] {
  return project.tracks.reduce<number[]>((acc, t, i) => (t.kind === kind ? [...acc, i] : acc), []);
}

/** Cuántas pistas hay de cada tipo (el `track` de un clip cuenta desde 0 por tipo). */
export function trackCount(project: EditorProject, kind: 'video' | 'audio' | 'text'): number {
  return project.tracks.filter((t) => t.kind === kind).length;
}

/**
 * Pista base de video: la de menor índice que tenga clips (igual que el
 * renderer, que concatena la pista más baja y superpone el resto).
 */
export function baseVideoTrack(project: EditorProject): number {
  const used = project.video.map((c) => c.track ?? 0);
  return used.length > 0 ? Math.min(...used) : 0;
}

export function videoClipsOnTrack(project: EditorProject, track: number): EditorVideoClip[] {
  return project.video.filter((c) => (c.track ?? 0) === track);
}

/** Segundos que ocupa un clip de la pista de video. */
export function videoClipDuration(clip: EditorVideoClip): number {
  if (clip.kind === 'image') {
    return Math.max(0, clip.length ?? EDITOR_DEFAULT_IMAGE_SECONDS);
  }
  const end = clip.out > 0 ? clip.out : clip.src_duration;
  return Math.max(0, round3(end - clip.in));
}

/** Segundos que suena un clip de audio. */
export function audioClipDuration(clip: EditorAudioClip): number {
  const end = clip.out > 0 ? clip.out : clip.src_duration;
  return Math.max(0, round3(end - clip.in));
}

/** Clips de la pista base, en orden de reproducción. */
export function baseClips(project: EditorProject): EditorVideoClip[] {
  return videoClipsOnTrack(project, baseVideoTrack(project));
}

/** Inicio de cada clip de la pista base (acumulado). */
export function videoStarts(project: EditorProject): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const clip of baseClips(project)) {
    starts.push(round3(acc));
    acc += videoClipDuration(clip);
  }
  return starts;
}

/** Duración total: la pista base, o el final del clip superpuesto más tardío. */
export function projectDuration(project: EditorProject): number {
  const base = baseClips(project).reduce((sum, clip) => sum + videoClipDuration(clip), 0);
  const overlays = project.video
    .filter((c) => (c.track ?? 0) !== baseVideoTrack(project))
    .reduce((max, c) => Math.max(max, (c.start ?? 0) + videoClipDuration(c)), 0);
  return round3(Math.max(base, overlays));
}

export interface TimelinePosition {
  index: number;
  /** Segundos transcurridos dentro del clip. */
  offset: number;
  start: number;
}

/** Clip de video que cubre el instante t (el último si t llega al final). */
/** Clip de la pista base que cubre el instante t (el último si t llega al final). */
export function locateVideo(project: EditorProject, t: number): TimelinePosition | null {
  const clips = baseClips(project);
  if (clips.length === 0) {
    return null;
  }
  const starts = videoStarts(project);
  const time = Math.max(0, t);
  for (let i = 0; i < clips.length; i++) {
    const dur = videoClipDuration(clips[i]);
    if (time < starts[i] + dur) {
      return { index: i, offset: Math.max(0, time - starts[i]), start: starts[i] };
    }
  }
  const last = clips.length - 1;
  return { index: last, offset: videoClipDuration(clips[last]), start: starts[last] };
}

/** Clip superpuesto visible en el instante t (pista más alta primero). */
export function overlayAt(project: EditorProject, t: number): EditorVideoClip | null {
  const base = baseVideoTrack(project);
  const overlays = project.video
    .filter((c) => (c.track ?? 0) !== base)
    .sort((a, b) => (b.track ?? 0) - (a.track ?? 0));
  for (const clip of overlays) {
    const start = clip.start ?? 0;
    if (t >= start && t < start + videoClipDuration(clip)) {
      return clip;
    }
  }
  return null;
}

/** Divide un clip de video en `offset` segundos. null si alguna mitad queda demasiado corta. */
export function splitVideoClip(
  clip: EditorVideoClip,
  offset: number,
  newId: () => string = createId,
): [EditorVideoClip, EditorVideoClip] | null {
  const dur = videoClipDuration(clip);
  if (offset < EDITOR_MIN_CLIP_SECONDS || dur - offset < EDITOR_MIN_CLIP_SECONDS) {
    return null;
  }
  if (clip.kind === 'image') {
    return [
      { ...clip, length: round3(offset) },
      { ...clip, id: newId(), length: round3(dur - offset), start: (clip.start ?? 0) + offset },
    ];
  }
  const cut = round3(clip.in + offset);
  const end = clip.out > 0 ? clip.out : clip.src_duration;
  return [
    { ...clip, out: cut },
    { ...clip, id: newId(), in: cut, out: end, start: (clip.start ?? 0) + offset },
  ];
}

/** Mueve el elemento `from` a la posición `to` (devuelve un arreglo nuevo). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Convierte una URL de reproducción en la fuente que entiende el back.
 * Prioriza el id de biblioteca; si no, solo sirven rutas bajo /outputs/.
 */
export function sourceFor(url: string, fileId?: string): EditorSource | null {
  if (fileId) {
    return { file_id: fileId };
  }
  let path = url;
  try {
    path = new URL(url, 'http://placeholder.local').pathname;
  } catch {
    return null;
  }
  // El servidor lee las salidas locales (/outputs/...) y las publicadas en el
  // bucket del tenant (/api/v1/t/<slug>/outputs/...); no las URLs de un proveedor.
  return path.startsWith('/outputs/') || /^\/api\/v1\/t\/[^/]+\/outputs\//.test(path)
    ? { output: path }
    : null;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** HH:MM:SS:FF, el código de tiempo clásico de los editores. */
export function formatTimecode(seconds: number, fps: number): string {
  const total = Math.max(0, seconds);
  const frames = Math.min(Math.max(1, Math.round(fps)) - 1, Math.floor((total % 1) * fps + 1e-6));
  const whole = Math.floor(total + 1e-6);
  return `${pad2(Math.floor(whole / 3600))}:${pad2(Math.floor((whole % 3600) / 60))}:${pad2(whole % 60)}:${pad2(frames)}`;
}

/** MM:SS para las marcas de la regla. */
export function formatRuler(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${pad2(Math.floor(whole / 60))}:${pad2(whole % 60)}`;
}

/** Posición de inserción en la pista de video para un instante soltado (frontera más cercana). */
export function insertIndexAt(project: EditorProject, time: number): number {
  const clips = baseClips(project);
  const starts = videoStarts(project);
  for (let i = 0; i < clips.length; i++) {
    const mid = starts[i] + videoClipDuration(clips[i]) / 2;
    if (time < mid) {
      return i;
    }
  }
  return clips.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface LaneItem {
  id: string;
  start: number;
  end: number;
}

/** Reparte elementos solapados en carriles (el primero libre, de arriba abajo). */
export function assignLanes(items: readonly LaneItem[]): {
  lanes: Map<string, number>;
  count: number;
} {
  const lanes = new Map<string, number>();
  const laneEnds: number[] = [];
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start + 1e-6);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    lanes.set(item.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}
