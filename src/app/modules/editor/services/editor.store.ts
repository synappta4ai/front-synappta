import { computed, Injectable, signal } from '@angular/core';

import {
  EDITOR_DEFAULT_IMAGE_SECONDS,
  EDITOR_MIN_CLIP_SECONDS,
  EditorAsset,
  EditorAudioClip,
  EditorClipInput,
  EditorProject,
  EditorSelection,
  EditorTextClip,
  EditorTrack,
  EditorTrackKind,
  EditorVideoClip,
} from '../interfaces';
import {
  baseClips,
  baseVideoTrack,
  clamp,
  createId,
  emptyProject,
  locateVideo,
  moveItem,
  overlayAt,
  projectDuration,
  sourceFor,
  splitVideoClip,
  videoStarts,
} from '../utils/timeline';

const HISTORY_LIMIT = 100;
/** Ediciones del mismo campo dentro de esta ventana cuentan como un solo paso de deshacer. */
const COALESCE_MS = 800;

export type AddClipResult = 'ok' | 'unsupported-source';

/**
 * Estado del proyecto en edición. Se provee a nivel de componente (una
 * instancia por editor abierto). Todas las mutaciones son inmutables, así el
 * historial de deshacer/rehacer guarda referencias baratas.
 */
@Injectable()
export class EditorStore {
  readonly project = signal<EditorProject>(emptyProject());
  readonly selection = signal<EditorSelection>(null);
  readonly playhead = signal(0);
  readonly dirty = signal(false);

  private readonly past = signal<EditorProject[]>([]);
  private readonly future = signal<EditorProject[]>([]);
  private lastKey = '';
  private lastAt = 0;

  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  readonly duration = computed(() => projectDuration(this.project()));
  readonly starts = computed(() => videoStarts(this.project()));

  readonly selectedVideo = computed(() => {
    const sel = this.selection();
    return sel?.track === 'video'
      ? (this.project().video.find((c) => c.id === sel.id) ?? null)
      : null;
  });
  readonly selectedAudio = computed(() => {
    const sel = this.selection();
    return sel?.track === 'audio'
      ? (this.project().audio.find((c) => c.id === sel.id) ?? null)
      : null;
  });
  readonly selectedText = computed(() => {
    const sel = this.selection();
    return sel?.track === 'text'
      ? (this.project().texts.find((c) => c.id === sel.id) ?? null)
      : null;
  });

  /** Reemplaza el proyecto (abrir/nuevo) y reinicia historial y selección. */
  load(project: EditorProject): void {
    this.project.set(project);
    this.past.set([]);
    this.future.set([]);
    this.selection.set(null);
    this.playhead.set(0);
    this.dirty.set(false);
    this.lastKey = '';
  }

  markSaved(): void {
    this.dirty.set(false);
  }

  select(selection: EditorSelection): void {
    this.selection.set(selection);
  }

  setPlayhead(t: number): void {
    this.playhead.set(clamp(t, 0, this.duration()));
  }

  setName(name: string): void {
    this.commit({ ...this.project(), name }, 'name');
  }

  setFormat(width: number, height: number): void {
    this.commit({ ...this.project(), width, height });
  }

  // ─── Altas ────────────────────────────────────────────────────

  /** Agrega material a la galería del proyecto (sin duplicar el mismo archivo). */
  addAssets(assets: readonly EditorAsset[]): EditorAsset[] {
    const p = this.project();
    const known = new Set(p.assets.map((a) => this.assetKey(a)));
    const fresh: EditorAsset[] = [];
    for (const asset of assets) {
      const key = this.assetKey(asset);
      if (!known.has(key)) {
        known.add(key);
        fresh.push(asset);
      }
    }
    if (fresh.length > 0) {
      this.commit({ ...p, assets: [...p.assets, ...fresh] });
    }
    return fresh;
  }

  removeAsset(id: string): void {
    const p = this.project();
    this.commit({ ...p, assets: p.assets.filter((a) => a.id !== id) });
  }

  /** Crea el clip correspondiente a un asset. `index` (video/imagen) y `start` (audio) son opcionales. */
  addAssetToTimeline(
    asset: EditorAsset,
    where: { index?: number; start?: number; track?: number } = {},
  ): AddClipResult {
    const input: EditorClipInput = {
      kind: asset.kind,
      url: asset.url,
      name: asset.name,
      fileId: asset.fileId,
      duration: asset.duration,
      hasAudio: asset.hasAudio,
    };
    return asset.kind === 'audio'
      ? this.addAudioClip(input, where.start, where.track)
      : this.addVideoClip(input, where.index, where.track, where.start);
  }

  // ─── Pistas ───────────────────────────────────────────────────

  addTrack(kind: EditorTrackKind): void {
    const p = this.project();
    const track: EditorTrack = { id: createId(), kind };
    this.commit({ ...p, tracks: [...p.tracks, track] });
  }

  /** Quita una pista y sus clips (nunca deja un tipo sin pistas). */
  removeTrack(kind: EditorTrackKind, track: number): boolean {
    const p = this.project();
    const ofKind = p.tracks.filter((t) => t.kind === kind);
    if (ofKind.length <= 1 || track < 0 || track >= ofKind.length) {
      return false;
    }
    let seen = -1;
    const globalIndex = p.tracks.findIndex((t) => {
      if (t.kind !== kind) {
        return false;
      }
      seen++;
      return seen === track;
    });
    if (globalIndex === -1) {
      return false;
    }
    const shift = (n: number | undefined): number => {
      const cur = n ?? 0;
      return cur > track ? cur - 1 : cur;
    };
    const keep = <T extends { track: number }>(clips: T[]): T[] =>
      clips.filter((c) => c.track !== track).map((c) => ({ ...c, track: shift(c.track) }));
    this.commit({
      ...p,
      tracks: p.tracks.filter((_, i) => i !== globalIndex),
      video: keep(p.video),
      audio: keep(p.audio),
      texts: keep(p.texts),
    });
    return true;
  }

  addVideoClip(input: EditorClipInput, index?: number, track = 0, start?: number): AddClipResult {
    const source = sourceFor(input.url, input.fileId);
    if (!source || input.kind === 'audio') {
      return 'unsupported-source';
    }
    const duration = input.duration && input.duration > 0 ? input.duration : 0;
    const clip: EditorVideoClip = {
      id: createId(),
      kind: input.kind,
      track,
      source,
      in: 0,
      out: input.kind === 'image' ? 0 : duration,
      length: input.kind === 'image' ? EDITOR_DEFAULT_IMAGE_SECONDS : undefined,
      start: track > 0 ? Math.max(0, start ?? 0) : undefined,
      label: input.name,
      url: input.url,
      src_duration: duration,
      has_audio: input.kind === 'video' && (input.hasAudio ?? false),
    };
    const p = this.project();
    const video = [...p.video];
    if (track === 0) {
      const at = this.baseInsertIndex(video, index);
      video.splice(at, 0, clip);
    } else {
      video.push(clip);
    }
    this.commit({ ...p, video });
    this.selection.set({ track: 'video', id: clip.id });
    return 'ok';
  }

  /** Índice global dentro de p.video para insertar en la pista base respetando su orden. */
  private baseInsertIndex(video: EditorVideoClip[], index?: number): number {
    const base = baseVideoTrack({ ...this.project(), video });
    const baseOrder = video
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => (c.track ?? 0) === base)
      .map(({ i }) => i);
    const at = index === undefined ? baseOrder.length : clamp(index, 0, baseOrder.length);
    return at >= baseOrder.length ? video.length : baseOrder[at];
  }

  addAudioClip(input: EditorClipInput, start?: number, track = 0): AddClipResult {
    const source = sourceFor(input.url, input.fileId);
    if (!source) {
      return 'unsupported-source';
    }
    const duration = input.duration && input.duration > 0 ? input.duration : 0;
    const clip: EditorAudioClip = {
      id: createId(),
      track,
      source,
      start: Math.max(0, start ?? this.playhead()),
      in: 0,
      out: duration,
      volume: 1,
      label: input.name,
      url: input.url,
      src_duration: duration,
    };
    const p = this.project();
    this.commit({ ...p, audio: [...p.audio, clip] });
    this.selection.set({ track: 'audio', id: clip.id });
    return 'ok';
  }

  addText(defaultText: string, track = 0): void {
    const start = this.playhead();
    const total = this.duration();
    const clip: EditorTextClip = {
      id: createId(),
      track,
      text: defaultText,
      start,
      end: total > start ? Math.min(total, start + 3) : start + 3,
      x: 0.5,
      y: 0.85,
      size: 48,
      color: '#FFFFFF',
    };
    const p = this.project();
    this.commit({ ...p, texts: [...p.texts, clip] });
    this.selection.set({ track: 'text', id: clip.id });
  }

  // ─── Edición ──────────────────────────────────────────────────

  /** Divide el clip de video (base o superpuesto) que está bajo el cabezal. */
  splitAtPlayhead(): boolean {
    const p = this.project();
    const t = this.playhead();
    const overlay = overlayAt(p, t);
    if (overlay) {
      const parts = splitVideoClip(overlay, t - (overlay.start ?? 0));
      if (!parts) {
        return false;
      }
      const video = p.video.flatMap((c) => (c.id === overlay.id ? parts : [c]));
      this.commit({ ...p, video });
      this.selection.set({ track: 'video', id: parts[1].id });
      return true;
    }
    const pos = locateVideo(p, t);
    if (!pos) {
      return false;
    }
    const clip = p.video.find((c) => c.id === baseClips(p)[pos.index]?.id);
    if (!clip) {
      return false;
    }
    const parts = splitVideoClip(clip, pos.offset);
    if (!parts) {
      return false;
    }
    const video = p.video.flatMap((c) => (c.id === clip.id ? parts : [c]));
    this.commit({ ...p, video });
    this.selection.set({ track: 'video', id: parts[1].id });
    return true;
  }

  removeSelected(): void {
    const sel = this.selection();
    if (!sel) {
      return;
    }
    const p = this.project();
    if (sel.track === 'video') {
      this.commit({ ...p, video: p.video.filter((c) => c.id !== sel.id) });
    } else if (sel.track === 'audio') {
      const audio = p.audio.find((c) => c.id === sel.id);
      if (audio?.linked_video_id) {
        // Quitar el sonido de un video = dejar ese video sin audio.
        this.commit({
          ...p,
          video: p.video.map((v) =>
            v.id === audio.linked_video_id ? { ...v, has_audio: false } : v,
          ),
        });
      } else {
        this.commit({ ...p, audio: p.audio.filter((c) => c.id !== sel.id) });
      }
    } else {
      this.commit({ ...p, texts: p.texts.filter((c) => c.id !== sel.id) });
    }
    this.selection.set(null);
    this.playhead.update((t) => Math.min(t, this.duration()));
  }

  moveVideo(id: string, direction: -1 | 1): void {
    const p = this.project();
    const base = baseVideoTrack(p);
    const ids = p.video.filter((c) => (c.track ?? 0) === base).map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) {
      return;
    }
    const order = moveItem(ids, from, to);
    const byId = new Map(p.video.map((c) => [c.id, c]));
    let next = 0;
    const video = p.video.map((c) =>
      (c.track ?? 0) === base ? (byId.get(order[next++]) ?? c) : c,
    );
    this.commit({ ...p, video });
  }

  patchVideo(id: string, patch: Partial<EditorVideoClip>, key = ''): void {
    const p = this.project();
    this.commit(
      {
        ...p,
        video: p.video.map((c) => (c.id === id ? this.sanitizeVideo({ ...c, ...patch }) : c)),
      },
      key ? `v:${id}:${key}` : undefined,
    );
  }

  patchAudio(id: string, patch: Partial<EditorAudioClip>, key = ''): void {
    const p = this.project();
    const audio = p.audio.find((c) => c.id === id);
    if (audio?.linked_video_id) {
      // El clip es el sonido de un video: se edita el video y se regenera.
      const videoClip = p.video.find((v) => v.id === audio.linked_video_id);
      const forwarded: Partial<EditorVideoClip> = {};
      if (patch.volume !== undefined) {
        forwarded.volume = patch.volume;
      }
      if (patch.in !== undefined) {
        forwarded.in = patch.in;
      }
      if (patch.out !== undefined) {
        forwarded.out = patch.out;
      }
      if (patch.start !== undefined && (videoClip?.track ?? 0) !== baseVideoTrack(p)) {
        forwarded.start = patch.start;
      }
      this.patchVideo(audio.linked_video_id, forwarded, key);
      return;
    }
    this.commit(
      {
        ...p,
        audio: p.audio.map((c) => (c.id === id ? this.sanitizeAudio({ ...c, ...patch }) : c)),
      },
      key ? `a:${id}:${key}` : undefined,
    );
  }

  patchText(id: string, patch: Partial<EditorTextClip>, key = ''): void {
    const p = this.project();
    this.commit(
      {
        ...p,
        texts: p.texts.map((c) => (c.id === id ? this.sanitizeText({ ...c, ...patch }) : c)),
      },
      key ? `t:${id}:${key}` : undefined,
    );
  }

  // ─── Historial ────────────────────────────────────────────────

  undo(): void {
    const past = this.past();
    if (past.length === 0) {
      return;
    }
    this.future.update((f) => [...f, this.project()]);
    this.project.set(past[past.length - 1]);
    this.past.set(past.slice(0, -1));
    this.afterHistoryMove();
  }

  redo(): void {
    const future = this.future();
    if (future.length === 0) {
      return;
    }
    this.past.update((p) => [...p, this.project()]);
    this.project.set(future[future.length - 1]);
    this.future.set(future.slice(0, -1));
    this.afterHistoryMove();
  }

  // ─── Internos ─────────────────────────────────────────────────

  private assetKey(a: EditorAsset): string {
    return a.fileId ?? a.url;
  }

  private afterHistoryMove(): void {
    this.dirty.set(true);
    this.lastKey = '';
    const sel = this.selection();
    const p = this.project();
    const exists =
      !sel ||
      (sel.track === 'video' && p.video.some((c) => c.id === sel.id)) ||
      (sel.track === 'audio' && p.audio.some((c) => c.id === sel.id)) ||
      (sel.track === 'text' && p.texts.some((c) => c.id === sel.id));
    if (!exists) {
      this.selection.set(null);
    }
    this.playhead.update((t) => Math.min(t, this.duration()));
  }

  /**
   * Deriva los clips de audio de los videos que traen sonido: cada uno se
   * coloca en la primera pista de audio, alineado con su video. Así el audio
   * se corta, mueve y ajusta en su propia pista, y el render no lo duplica
   * (el video va con `audio_detached`).
   */
  private syncLinkedAudio(p: EditorProject): EditorProject {
    const base = baseVideoTrack(p);
    const baseIds = baseClips(p).map((c) => c.id);
    const starts = videoStarts(p);
    const manual = p.audio.filter((a) => !a.linked_video_id);
    const linked: EditorAudioClip[] = [];
    for (const v of p.video) {
      if (!v.has_audio || v.kind === 'image') {
        continue;
      }
      const idx = baseIds.indexOf(v.id);
      const start = (v.track ?? 0) === base ? (idx >= 0 ? starts[idx] : 0) : (v.start ?? 0);
      const end = v.out > 0 ? v.out : v.src_duration;
      linked.push({
        id: `linked:${v.id}`,
        track: 0,
        linked_video_id: v.id,
        source: v.source,
        start,
        in: v.in,
        out: end,
        volume: v.volume ?? 1,
        label: v.label,
        url: v.url,
        src_duration: v.src_duration,
      });
    }
    const video = p.video.map((v) => (v.has_audio ? { ...v, audio_detached: true } : v));
    return { ...p, video, audio: [...manual, ...linked] };
  }

  private commit(next: EditorProject, key?: string): void {
    const now = Date.now();
    const coalesce = key !== undefined && key === this.lastKey && now - this.lastAt < COALESCE_MS;
    if (!coalesce) {
      this.past.update((p) => [...p, this.project()].slice(-HISTORY_LIMIT));
    }
    this.future.set([]);
    this.lastKey = key ?? '';
    this.lastAt = now;
    this.project.set(this.syncLinkedAudio(next));
    this.dirty.set(true);
  }

  private sanitizeVideo(c: EditorVideoClip): EditorVideoClip {
    if (c.kind === 'image') {
      return {
        ...c,
        length: Math.max(EDITOR_MIN_CLIP_SECONDS, c.length ?? EDITOR_DEFAULT_IMAGE_SECONDS),
        volume: undefined,
      };
    }
    const max = c.src_duration > 0 ? c.src_duration : Number.POSITIVE_INFINITY;
    const inPoint = clamp(c.in, 0, Math.max(0, max - EDITOR_MIN_CLIP_SECONDS));
    const end = c.out > 0 ? c.out : max;
    const out = clamp(end, inPoint + EDITOR_MIN_CLIP_SECONDS, max);
    return {
      ...c,
      in: inPoint,
      out: Number.isFinite(out) ? out : inPoint + EDITOR_MIN_CLIP_SECONDS,
      start: c.start === undefined ? undefined : Math.max(0, c.start),
      volume: c.volume === undefined ? undefined : clamp(c.volume, 0, 2),
    };
  }

  private sanitizeAudio(c: EditorAudioClip): EditorAudioClip {
    const max = c.src_duration > 0 ? c.src_duration : Number.POSITIVE_INFINITY;
    const inPoint = clamp(c.in, 0, Math.max(0, max - EDITOR_MIN_CLIP_SECONDS));
    const end = c.out > 0 ? c.out : max;
    const out = clamp(end, inPoint + EDITOR_MIN_CLIP_SECONDS, max);
    return {
      ...c,
      start: Math.max(0, c.start),
      in: inPoint,
      out: Number.isFinite(out) ? out : 0,
      volume: c.volume === undefined ? undefined : clamp(c.volume, 0, 2),
    };
  }

  private sanitizeText(c: EditorTextClip): EditorTextClip {
    const start = Math.max(0, c.start);
    return {
      ...c,
      start,
      end: Math.max(start + EDITOR_MIN_CLIP_SECONDS, c.end),
      x: clamp(c.x, 0, 1),
      y: clamp(c.y, 0, 1),
      size: clamp(Math.round(c.size), 8, 300),
    };
  }
}
