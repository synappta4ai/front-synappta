import { HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, switchMap, takeWhile, timer } from 'rxjs';

import { LibraryService } from '@modules/library/services';
import { ServerUrlPipe } from '@pipes/server-url.pipe';

import {
  EDITOR_MAX_SECONDS,
  EDITOR_MAX_UPLOAD_BYTES,
  EditorAsset,
  EditorAudioClip,
  EditorClipInput,
  EditorProject,
  EditorProjectSummary,
  EditorTextClip,
  EditorTrackKind,
  EditorVideoClip,
} from '../../interfaces';
import { EditorService, EditorStore, EditorTransferService } from '../../services';
import { probeDuration } from '../../utils/media-duration';
import {
  assignLanes,
  audioClipDuration,
  baseClips,
  baseVideoTrack,
  clamp,
  createId,
  emptyProject,
  formatRuler,
  formatTimecode,
  insertIndexAt,
  locateVideo,
  overlayAt,
  sourceFor,
  videoClipDuration,
} from '../../utils/timeline';
import { ExportDialogComponent } from '../export-dialog/export-dialog.component';
import { ImportGenerationsDialogComponent } from '../import-generations-dialog/import-generations-dialog.component';

type LeftTab = 'assets' | 'text';
type NoticeKind = 'info' | 'error';
type TrackKind = 'video' | 'audio' | 'text';
type ResizeTarget = 'left' | 'right' | 'timeline';

interface DragState {
  track: 'audio' | 'text';
  kind: TrackKind;
  id: string;
  startX: number;
  originStart: number;
  originEnd: number;
}

interface RowBlock {
  id: string;
  left: number;
  width: number;
  top: number;
}

interface TimelineRow {
  key: string;
  kind: TrackKind;
  index: number;
  height: number;
  blocks: RowBlock[];
}

const FORMATS: readonly { value: string; label: string; width: number; height: number }[] = [
  { value: '1280x720', label: '16:9 · 1280×720', width: 1280, height: 720 },
  { value: '1920x1080', label: '16:9 · 1920×1080', width: 1920, height: 1080 },
  { value: '720x1280', label: '9:16 · 720×1280', width: 720, height: 1280 },
  { value: '1080x1080', label: '1:1 · 1080×1080', width: 1080, height: 1080 },
];

const ASSET_DRAG_TYPE = 'application/x-editor-asset';
const LANE_HEIGHT = 30;
const VIDEO_ROW_HEIGHT = 56;

/**
 * Editor de video (Herramientas). El navegador solo edita el JSON del proyecto
 * y reproduce las fuentes; el render final lo hace el servidor con ffmpeg.
 */
@Component({
  selector: 'app-editor',
  imports: [
    TranslatePipe,
    ServerUrlPipe,
    RouterLink,
    ImportGenerationsDialogComponent,
    ExportDialogComponent,
  ],
  providers: [EditorStore, ServerUrlPipe],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'onKey($event)' },
})
export class EditorComponent implements OnInit {
  protected readonly store = inject(EditorStore);
  private readonly editorService = inject(EditorService);
  private readonly transfer = inject(EditorTransferService);
  private readonly libraryService = inject(LibraryService);
  private readonly serverUrl = inject(ServerUrlPipe);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly formats = FORMATS;
  protected readonly maxSeconds = EDITOR_MAX_SECONDS;
  protected readonly laneHeight = LANE_HEIGHT;
  protected readonly videoRowHeight = VIDEO_ROW_HEIGHT;
  protected readonly formatRuler = formatRuler;

  // ─── Estado de pantalla ─────────────────────────────────────────
  protected readonly projectId = signal<string | null>(null);
  protected readonly projects = signal<EditorProjectSummary[]>([]);
  protected readonly saving = signal(false);
  protected readonly notice = signal<{ text: string; kind: NoticeKind } | null>(null);
  protected readonly playing = signal(false);
  protected readonly zoom = signal(60);
  protected readonly stillImage = signal('');
  protected readonly overlayStill = signal('');
  protected readonly leftTab = signal<LeftTab>('assets');
  protected readonly importOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly importing = signal(false);
  protected readonly dropTarget = signal<string | null>(null);

  // Paneles ajustables (se pueden arrastrar los divisores).
  protected readonly leftWidth = signal(330);
  protected readonly rightWidth = signal(300);
  protected readonly timelineHeight = signal(250);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly overlayRef = viewChild<ElementRef<HTMLVideoElement>>('overlayVideo');
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly contentRef = viewChild<ElementRef<HTMLElement>>('tlContent');

  // ─── Derivados ──────────────────────────────────────────────────
  protected readonly workspaceColumns = computed(
    () => `44px ${this.leftWidth()}px 6px minmax(0, 1fr) 6px ${this.rightWidth()}px`,
  );
  protected readonly formatValue = computed(
    () => `${this.store.project().width}x${this.store.project().height}`,
  );
  protected readonly stageRatio = computed(
    () => `${this.store.project().width} / ${this.store.project().height}`,
  );
  protected readonly stageRatioValue = computed(
    () => this.store.project().width / this.store.project().height,
  );
  protected readonly timecode = computed(() =>
    formatTimecode(this.store.playhead(), this.store.project().fps),
  );
  protected readonly totalTimecode = computed(() =>
    formatTimecode(this.store.duration(), this.store.project().fps),
  );

  protected readonly visibleTexts = computed(() => {
    const t = this.store.playhead();
    return this.store.project().texts.filter((c) => t >= c.start && t < c.end);
  });

  protected readonly timelineSeconds = computed(() => {
    const p = this.store.project();
    const audioEnd = Math.max(0, ...p.audio.map((c) => c.start + audioClipDuration(c)));
    const textEnd = Math.max(0, ...p.texts.map((c) => c.end));
    return Math.max(this.store.duration(), audioEnd, textEnd, 10) + 5;
  });
  protected readonly timelineWidth = computed(() =>
    Math.ceil(this.timelineSeconds() * this.zoom()),
  );

  protected readonly ticks = computed(() => {
    const z = this.zoom();
    const step = z >= 100 ? 1 : z >= 50 ? 5 : z >= 25 ? 10 : 30;
    const out: { left: number; label: string }[] = [];
    for (let t = 0; t <= this.timelineSeconds(); t += step) {
      out.push({ left: t * z, label: formatRuler(t) });
    }
    return out;
  });

  /** Filas del timeline: texto, luego video (las pistas altas arriba) y audio. */
  protected readonly rows = computed<TimelineRow[]>(() => {
    const p = this.store.project();
    const z = this.zoom();
    const rows: TimelineRow[] = [];
    const count = (k: TrackKind): number => p.tracks.filter((t) => t.kind === k).length;
    const base = baseVideoTrack(p);
    const starts = this.store.starts();
    const baseIds = baseClips(p).map((c) => c.id);

    for (let i = 0; i < count('text'); i++) {
      const clips = p.texts.filter((c) => c.track === i);
      const { lanes, count: laneCount } = assignLanes(
        clips.map((c) => ({ id: c.id, start: c.start, end: c.end })),
      );
      rows.push({
        key: `text-${i}`,
        kind: 'text',
        index: i,
        height: laneCount * LANE_HEIGHT + 10,
        blocks: clips.map((c) => ({
          id: c.id,
          left: c.start * z,
          width: Math.max(28, (c.end - c.start) * z),
          top: 5 + (lanes.get(c.id) ?? 0) * LANE_HEIGHT,
        })),
      });
    }

    for (let i = count('video') - 1; i >= 0; i--) {
      const clips = p.video.filter((c) => (c.track ?? 0) === i);
      rows.push({
        key: `video-${i}`,
        kind: 'video',
        index: i,
        height: VIDEO_ROW_HEIGHT,
        blocks: clips.map((c) => {
          const baseIdx = baseIds.indexOf(c.id);
          const left = i === base ? (baseIdx >= 0 ? starts[baseIdx] : 0) : (c.start ?? 0);
          return {
            id: c.id,
            left: left * z,
            width: Math.max(28, videoClipDuration(c) * z),
            top: 4,
          };
        }),
      });
    }

    for (let i = 0; i < count('audio'); i++) {
      const clips = p.audio.filter((c) => c.track === i);
      const { lanes, count: laneCount } = assignLanes(
        clips.map((c) => ({ id: c.id, start: c.start, end: c.start + audioClipDuration(c) })),
      );
      rows.push({
        key: `audio-${i}`,
        kind: 'audio',
        index: i,
        height: laneCount * LANE_HEIGHT + 10,
        blocks: clips.map((c) => ({
          id: c.id,
          left: c.start * z,
          width: Math.max(28, audioClipDuration(c) * z),
          top: 5 + (lanes.get(c.id) ?? 0) * LANE_HEIGHT,
        })),
      });
    }
    return rows;
  });

  protected readonly canExport = computed(
    () => this.store.duration() > 0 && this.store.duration() <= EDITOR_MAX_SECONDS,
  );

  // ─── Internos ──────────────────────────────────────────────────
  private videoSrc = '';
  private overlaySrc = '';
  private pendingSeek: number | null = null;
  private raf = 0;
  private lastTick = 0;
  private readonly audioEls = new Map<string, HTMLAudioElement>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private resave = false;
  private drag: DragState | null = null;
  private resize: {
    target: ResizeTarget;
    x: number;
    y: number;
    left: number;
    right: number;
    height: number;
  } | null = null;

  constructor() {
    effect(() => {
      if (this.store.dirty()) {
        untracked(() => this.scheduleSave());
      }
    });
    effect(() => {
      const t = this.store.playhead();
      this.store.project();
      untracked(() => {
        if (!this.playing()) {
          this.showClipAt(t);
        }
      });
    });
    effect(() => {
      const ids = new Set(this.store.project().audio.map((c) => c.id));
      untracked(() => {
        for (const [id, el] of this.audioEls) {
          if (!ids.has(id)) {
            el.pause();
            el.removeAttribute('src');
            this.audioEls.delete(id);
          }
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.saveTimer);
      clearTimeout(this.noticeTimer);
      this.stopLoop();
      for (const el of this.audioEls.values()) {
        el.pause();
        el.removeAttribute('src');
      }
      this.audioEls.clear();
    });
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.refreshProjects();
    const inbox = this.transfer.take();
    const projectParam = this.route.snapshot.queryParamMap.get('project');
    if (projectParam) {
      void this.openProject(projectParam).then(() => this.addInbox(inbox));
    } else if (inbox.length > 0) {
      void this.addInbox(inbox);
    }
  }

  // ─── Proyectos ──────────────────────────────────────────────────

  private refreshProjects(): void {
    this.editorService
      .listProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (list) => this.projects.set(list ?? []), error: () => undefined });
  }

  private normalizeLoaded(raw: Partial<EditorProject> | null | undefined): EditorProject {
    const base = emptyProject();
    return {
      ...base,
      ...(raw ?? {}),
      version: 1,
      tracks: raw?.tracks?.length ? raw.tracks : base.tracks,
      assets: raw?.assets ?? [],
      video: (raw?.video ?? []).map((c) => ({ ...c, track: c.track ?? 0 })),
      audio: (raw?.audio ?? []).map((c) => ({ ...c, track: c.track ?? 0 })),
      texts: (raw?.texts ?? []).map((c) => ({ ...c, track: c.track ?? 0 })),
    };
  }

  protected async openProject(id: string): Promise<void> {
    if (!id) {
      return;
    }
    await this.flushSave();
    this.pausePlayback();
    try {
      const rec = await firstValueFrom(this.editorService.getProject(id));
      this.store.load(this.normalizeLoaded({ ...rec.project, name: rec.name }));
      this.projectId.set(rec.id);
      this.setQueryProject(rec.id);
    } catch {
      this.showNotice('EDITOR.ERRORS.LOAD', 'error');
      this.projectId.set(null);
      this.setQueryProject(null);
    }
  }

  protected async newProject(): Promise<void> {
    await this.flushSave();
    this.pausePlayback();
    this.store.load(emptyProject());
    this.projectId.set(null);
    this.setQueryProject(null);
  }

  protected async deleteProject(): Promise<void> {
    const id = this.projectId();
    if (
      !id ||
      !this.isBrowser ||
      !window.confirm(this.translate.instant('EDITOR.DELETE_CONFIRM'))
    ) {
      return;
    }
    clearTimeout(this.saveTimer);
    try {
      await firstValueFrom(this.editorService.deleteProject(id));
    } catch {
      this.showNotice('EDITOR.ERRORS.SAVE', 'error');
      return;
    }
    this.store.load(emptyProject());
    this.projectId.set(null);
    this.setQueryProject(null);
    this.refreshProjects();
  }

  private setQueryProject(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { project: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    const p = this.store.project();
    if (
      !this.projectId() &&
      p.video.length === 0 &&
      p.audio.length === 0 &&
      p.assets.length === 0
    ) {
      return;
    }
    this.saveTimer = setTimeout(() => void this.save(), 1500);
  }

  private async flushSave(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (this.store.dirty()) {
      await this.save();
    }
  }

  protected async save(): Promise<boolean> {
    if (this.saving()) {
      this.resave = true;
      return false;
    }
    clearTimeout(this.saveTimer);
    const snapshot = this.store.project();
    const name = snapshot.name.trim() || this.translate.instant('EDITOR.UNTITLED');
    this.saving.set(true);
    try {
      const id = this.projectId();
      if (id) {
        await firstValueFrom(this.editorService.updateProject(id, name, snapshot));
      } else {
        const rec = await firstValueFrom(this.editorService.createProject(name, snapshot));
        this.projectId.set(rec.id);
        this.setQueryProject(rec.id);
      }
      this.refreshProjects();
      if (this.store.project() === snapshot) {
        this.store.markSaved();
      } else {
        this.resave = true;
      }
      return true;
    } catch (err) {
      this.showNotice(this.errorText(err, 'EDITOR.ERRORS.SAVE'), 'error', true);
      return false;
    } finally {
      this.saving.set(false);
      if (this.resave) {
        this.resave = false;
        this.scheduleSave();
      }
    }
  }

  // ─── Pistas ─────────────────────────────────────────────────────

  protected addTrack(kind: EditorTrackKind): void {
    this.store.addTrack(kind);
  }

  protected removeTrack(kind: EditorTrackKind, index: number, event: Event): void {
    event.stopPropagation();
    if (!this.store.removeTrack(kind, index)) {
      this.showNotice('EDITOR.ERRORS.LAST_TRACK', 'info');
    }
  }

  /** Índice de una pista dentro de su tipo (0 = primera de ese tipo). */
  protected trackNumber(kind: EditorTrackKind, index: number): number {
    return index + 1;
  }

  // ─── Galería de assets ──────────────────────────────────────────

  protected setLeftTab(tab: LeftTab): void {
    this.leftTab.set(tab);
  }

  protected async onFilesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) {
      return;
    }
    this.importing.set(true);
    try {
      const added: EditorAsset[] = [];
      for (const file of files) {
        const kind = file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('audio/')
              ? 'audio'
              : null;
        if (!kind) {
          this.showNotice('EDITOR.ERRORS.FILE_TYPE', 'error');
          continue;
        }
        if (file.size > EDITOR_MAX_UPLOAD_BYTES) {
          this.showNotice('EDITOR.ERRORS.TOO_BIG', 'error');
          continue;
        }
        try {
          const category = kind === 'video' ? 'videos' : kind === 'image' ? 'images' : 'audio';
          const uploaded = await firstValueFrom(this.libraryService.uploadFile(file, category));
          if (!uploaded.url) {
            throw new Error('no url');
          }
          added.push(
            await this.withMedia({
              id: createId(),
              kind,
              name: uploaded.filename,
              url: uploaded.url,
              thumb: kind === 'image' ? (uploaded.thumbnail_url ?? uploaded.url) : '',
              fileId: uploaded.id,
              duration: 0,
            }),
          );
        } catch (err) {
          this.showNotice(this.errorText(err, 'EDITOR.ERRORS.UPLOAD'), 'error', true);
        }
      }
      this.store.addAssets(added);
    } finally {
      this.importing.set(false);
    }
  }

  protected async onImported(assets: EditorAsset[]): Promise<void> {
    this.importing.set(true);
    try {
      const ready: EditorAsset[] = [];
      for (const asset of assets) {
        ready.push(await this.withMedia(asset));
      }
      this.store.addAssets(ready);
    } finally {
      this.importing.set(false);
    }
  }

  /**
   * Pide al servidor la duración, el sonido y la miniatura del clip. Si el
   * servidor no puede leerlo, cae al sondeo del navegador.
   */
  private async withMedia(asset: EditorAsset): Promise<EditorAsset> {
    if (asset.kind === 'image') {
      return asset;
    }
    const src = sourceFor(asset.url, asset.fileId);
    if (src) {
      try {
        const info = await firstValueFrom(
          this.editorService.media({ fileId: src.file_id, output: src.output }),
        );
        return {
          ...asset,
          duration: info.duration || asset.duration,
          hasAudio: info.has_audio,
          thumb: info.poster ? info.poster : asset.thumb,
        };
      } catch {
        /* cae al sondeo del navegador */
      }
    }
    let duration = asset.duration;
    for (let attempt = 1; attempt <= 2 && duration <= 0; attempt++) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      duration = await probeDuration(this.serverUrl.transform(asset.url), asset.kind);
    }
    return { ...asset, duration };
  }

  protected async addAsset(
    asset: EditorAsset,
    where: { index?: number; start?: number; track?: number } = {},
  ): Promise<void> {
    const ready = await this.withMedia(asset);
    if (ready.kind !== 'image' && ready.duration <= 0) {
      this.showNotice('EDITOR.ERRORS.DURATION', 'error');
      return;
    }
    const track = where.track ?? 0;
    if (this.store.addAssetToTimeline(ready, { ...where, track }) !== 'ok') {
      this.showNotice('EDITOR.ERRORS.SOURCE', 'error');
    }
  }

  protected removeAsset(asset: EditorAsset, event: Event): void {
    event.stopPropagation();
    this.store.removeAsset(asset.id);
  }

  private async addInbox(inbox: readonly EditorClipInput[]): Promise<void> {
    for (const input of inbox) {
      const asset = await this.withMedia({
        id: createId(),
        kind: input.kind,
        name: input.name,
        url: input.url,
        thumb: input.kind === 'image' ? input.url : '',
        fileId: input.fileId,
        duration: input.duration ?? 0,
      });
      this.store.addAssets([asset]);
      await this.addAsset(asset);
    }
  }

  // ─── Arrastrar y soltar ─────────────────────────────────────────

  protected onAssetDragStart(event: DragEvent, asset: EditorAsset): void {
    event.dataTransfer?.setData(ASSET_DRAG_TYPE, asset.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  protected onTrackDragOver(event: DragEvent, kind: TrackKind, index: number): void {
    if (event.dataTransfer?.types.includes(ASSET_DRAG_TYPE)) {
      event.preventDefault();
      this.dropTarget.set(`${kind}-${index}`);
    }
  }

  protected onTrackDragLeave(): void {
    this.dropTarget.set(null);
  }

  protected onTrackDrop(event: DragEvent, kind: TrackKind, index: number): void {
    event.preventDefault();
    this.dropTarget.set(null);
    const id = event.dataTransfer?.getData(ASSET_DRAG_TYPE);
    const asset = this.store.project().assets.find((a) => a.id === id);
    if (!asset) {
      return;
    }
    if (kind === 'audio' && asset.kind !== 'audio') {
      this.showNotice('EDITOR.ERRORS.WRONG_TRACK_AUDIO', 'info');
      return;
    }
    if (kind !== 'audio' && asset.kind === 'audio') {
      this.showNotice('EDITOR.ERRORS.WRONG_TRACK_VIDEO', 'info');
      return;
    }
    const time = Math.round(this.timeFromEvent(event) * 10) / 10;
    if (asset.kind === 'audio') {
      void this.addAsset(asset, { start: time, track: index });
    } else if (index === baseVideoTrack(this.store.project())) {
      void this.addAsset(asset, { index: insertIndexAt(this.store.project(), time), track: index });
    } else {
      void this.addAsset(asset, { start: time, track: index });
    }
  }

  // ─── Reproducción ───────────────────────────────────────────────

  protected togglePlay(): void {
    if (this.playing()) {
      this.pausePlayback();
      return;
    }
    if (!this.isBrowser || this.store.duration() <= 0) {
      return;
    }
    if (this.store.playhead() >= this.store.duration() - 0.05) {
      this.store.setPlayhead(0);
    }
    this.playing.set(true);
    this.showClipAt(this.store.playhead());
    this.syncAudio(this.store.playhead());
    this.lastTick = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  protected pausePlayback(): void {
    if (!this.playing()) {
      return;
    }
    this.playing.set(false);
    this.stopLoop();
    this.videoRef()?.nativeElement.pause();
    this.overlayRef()?.nativeElement.pause();
    for (const el of this.audioEls.values()) {
      el.pause();
    }
  }

  protected fullscreen(): void {
    void this.stageRef()?.nativeElement.requestFullscreen?.();
  }

  private stopLoop(): void {
    if (this.raf && this.isBrowser) {
      cancelAnimationFrame(this.raf);
    }
    this.raf = 0;
  }

  protected seekTo(t: number): void {
    this.store.setPlayhead(t);
    if (this.playing()) {
      this.showClipAt(this.store.playhead());
      for (const el of this.audioEls.values()) {
        el.pause();
      }
      this.syncAudio(this.store.playhead());
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.playing()) {
      return;
    }
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const project = this.store.project();
    const t = this.store.playhead();
    const pos = locateVideo(project, t);
    if (!pos) {
      this.pausePlayback();
      return;
    }
    const clips = baseClips(project);
    const clip = clips[pos.index];
    const clipEnd = pos.start + videoClipDuration(clip);
    let next = t;
    if (clip.kind === 'image') {
      next = t + dt;
    } else {
      const video = this.videoRef()?.nativeElement;
      if (
        video &&
        !video.seeking &&
        video.readyState >= 2 &&
        this.videoSrc === this.serverUrl.transform(clip.url)
      ) {
        next = Math.max(t, pos.start + (video.currentTime - clip.in));
      }
    }
    if (next >= clipEnd - 0.02) {
      this.advance(pos.index);
    } else {
      this.store.setPlayhead(next);
      this.syncAudio(next);
      this.syncOverlay(next);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private advance(index: number): void {
    const starts = this.store.starts();
    const clips = baseClips(this.store.project());
    if (index >= clips.length - 1) {
      this.store.setPlayhead(this.store.duration());
      this.pausePlayback();
      return;
    }
    this.store.setPlayhead(starts[index + 1]);
    this.showClipAt(starts[index + 1]);
    this.syncAudio(starts[index + 1]);
    this.syncOverlay(starts[index + 1]);
  }

  protected onVideoEnded(): void {
    if (!this.playing()) {
      return;
    }
    const pos = locateVideo(this.store.project(), this.store.playhead());
    if (pos) {
      this.advance(pos.index);
    }
  }

  protected onVideoLoaded(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    if (this.pendingSeek !== null) {
      video.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    }
    if (this.playing()) {
      void video.play().catch(() => undefined);
    }
  }

  /** Muestra el fotograma del instante t: pista base + clip superpuesto. */
  private showClipAt(t: number): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    const project = this.store.project();
    const pos = locateVideo(project, t);
    if (!pos) {
      this.stillImage.set('');
      if (this.videoSrc) {
        this.videoSrc = '';
        video.removeAttribute('src');
        video.load();
      }
    } else {
      const clip = baseClips(project)[pos.index];
      const url = this.serverUrl.transform(clip.url);
      if (clip.kind === 'image') {
        video.pause();
        this.stillImage.set(url);
      } else {
        this.stillImage.set('');
        const target = clip.in + pos.offset;
        // El sonido del clip vive en su clip de audio vinculado.
        video.volume = clip.has_audio ? 0 : clamp(clip.volume ?? 1, 0, 1);
        if (this.videoSrc !== url) {
          this.videoSrc = url;
          this.pendingSeek = target;
          video.src = url;
        } else {
          if (!this.playing() || Math.abs(video.currentTime - target) > 0.05) {
            video.currentTime = target;
          }
          if (this.playing()) {
            void video.play().catch(() => undefined);
          }
        }
      }
    }
    this.syncOverlay(t);
  }

  /** Pinta el clip superpuesto (pista de video más alta) sobre la vista previa. */
  private syncOverlay(t: number): void {
    const el = this.overlayRef()?.nativeElement;
    if (!el) {
      return;
    }
    const overlay = overlayAt(this.store.project(), t);
    if (!overlay || overlay.kind === 'image') {
      el.pause();
      this.overlayStill.set(overlay ? this.serverUrl.transform(overlay.url) : '');
      if (this.overlaySrc) {
        this.overlaySrc = '';
        el.removeAttribute('src');
        el.load();
      }
      return;
    }
    this.overlayStill.set('');
    const url = this.serverUrl.transform(overlay.url);
    const target = overlay.in + (t - (overlay.start ?? 0));
    el.volume = 0;
    if (this.overlaySrc !== url) {
      this.overlaySrc = url;
      el.src = url;
      el.currentTime = target;
    } else if (Math.abs(el.currentTime - target) > 0.25) {
      el.currentTime = target;
    }
    if (this.playing()) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }

  private syncAudio(t: number): void {
    for (const clip of this.store.project().audio) {
      const el = this.audioFor(clip);
      const active = t >= clip.start && t < clip.start + audioClipDuration(clip);
      if (active) {
        const want = clip.in + (t - clip.start);
        el.volume = clamp(clip.volume ?? 1, 0, 1);
        if (el.paused) {
          el.currentTime = want;
          void el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - want) > 0.35) {
          el.currentTime = want;
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
  }

  private audioFor(clip: EditorAudioClip): HTMLAudioElement {
    let el = this.audioEls.get(clip.id);
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.src = this.serverUrl.transform(clip.url);
      this.audioEls.set(clip.id, el);
    }
    return el;
  }

  // ─── Timeline: interacción ──────────────────────────────────────

  protected timeFromEvent(event: MouseEvent): number {
    const rect = this.contentRef()?.nativeElement.getBoundingClientRect();
    return rect ? Math.max(0, (event.clientX - rect.left) / this.zoom()) : 0;
  }

  protected onTimelineClick(event: MouseEvent): void {
    this.store.select(null);
    this.seekTo(this.timeFromEvent(event));
  }

  protected onRulerDown(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    this.seekTo(this.timeFromEvent(event));
  }

  protected onRulerMove(event: PointerEvent): void {
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      this.seekTo(this.timeFromEvent(event));
    }
  }

  protected videoById(id: string): EditorVideoClip | null {
    return this.store.project().video.find((c) => c.id === id) ?? null;
  }

  protected audioById(id: string): EditorAudioClip | null {
    return this.store.project().audio.find((c) => c.id === id) ?? null;
  }

  protected textById(id: string): EditorTextClip | null {
    return this.store.project().texts.find((c) => c.id === id) ?? null;
  }

  protected selectVideo(clip: EditorVideoClip, event: MouseEvent): void {
    event.stopPropagation();
    this.store.select({ track: 'video', id: clip.id });
    this.seekTo(this.timeFromEvent(event));
  }

  protected selectText(clip: EditorTextClip): void {
    this.store.select({ track: 'text', id: clip.id });
    this.seekTo(clip.start);
  }

  protected startDrag(
    event: PointerEvent,
    kind: TrackKind,
    clip: EditorAudioClip | EditorTextClip | EditorVideoClip,
  ): void {
    event.stopPropagation();
    this.store.select({ track: kind === 'video' ? 'video' : kind, id: clip.id });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const end =
      'end' in clip
        ? clip.end
        : clip.start !== undefined
          ? clip.start + videoClipDuration(clip as EditorVideoClip)
          : 0;
    const start = 'start' in clip && clip.start !== undefined ? clip.start : 0;
    this.drag = {
      track: kind === 'text' ? 'text' : 'audio',
      kind,
      id: clip.id,
      startX: event.clientX,
      originStart: start,
      originEnd: end,
    };
  }

  protected onDragMove(event: PointerEvent): void {
    const d = this.drag;
    if (!d) {
      return;
    }
    const start = Math.max(
      0,
      Math.round((d.originStart + (event.clientX - d.startX) / this.zoom()) * 10) / 10,
    );
    if (d.kind === 'video') {
      this.store.patchVideo(d.id, { start }, 'move');
    } else if (d.kind === 'audio') {
      this.store.patchAudio(d.id, { start }, 'move');
    } else {
      this.store.patchText(d.id, { start, end: start + (d.originEnd - d.originStart) }, 'move');
    }
  }

  protected endDrag(event: PointerEvent): void {
    this.drag = null;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
  }

  protected setZoom(event: Event): void {
    const v = this.numberFrom(event);
    if (v !== null) {
      this.zoom.set(clamp(v, 10, 200));
    }
  }

  protected zoomBy(delta: number): void {
    this.zoom.update((z) => clamp(z + delta, 10, 200));
  }

  // ─── Paneles redimensionables ───────────────────────────────────

  protected startResize(event: PointerEvent, target: ResizeTarget): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resize = {
      target,
      x: event.clientX,
      y: event.clientY,
      left: this.leftWidth(),
      right: this.rightWidth(),
      height: this.timelineHeight(),
    };
  }

  protected onResizeMove(event: PointerEvent): void {
    const r = this.resize;
    if (!r) {
      return;
    }
    if (r.target === 'left') {
      this.leftWidth.set(clamp(r.left + (event.clientX - r.x), 200, 560));
    } else if (r.target === 'right') {
      this.rightWidth.set(clamp(r.right - (event.clientX - r.x), 200, 520));
    } else {
      this.timelineHeight.set(clamp(r.height - (event.clientY - r.y), 140, 520));
    }
  }

  protected endResize(event: PointerEvent): void {
    this.resize = null;
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
  }

  /**
   * Para el dock vertical: ancho del panel y alto de la zona superior.
   * (Los divisores cambian de dirección según el tipo.)
   */
  protected resizeCursor(target: ResizeTarget): string {
    return target === 'timeline' ? 'row-resize' : 'col-resize';
  }

  // ─── Propiedades ────────────────────────────────────────────────

  private numberFrom(event: Event): number | null {
    const v = parseFloat((event.target as HTMLInputElement).value);
    return Number.isFinite(v) ? v : null;
  }

  protected setVideo(
    clip: EditorVideoClip,
    field: 'in' | 'out' | 'length' | 'volume' | 'start',
    event: Event,
  ): void {
    const v = this.numberFrom(event);
    if (v === null) {
      return;
    }
    this.store.patchVideo(clip.id, { [field]: v } as Partial<EditorVideoClip>, field);
    const updated = this.store.project().video.find((c) => c.id === clip.id);
    if (updated && field !== 'volume') {
      (event.target as HTMLInputElement).value = String(updated[field] ?? '');
    }
  }

  protected setAudio(
    clip: EditorAudioClip,
    field: 'start' | 'in' | 'out' | 'volume',
    event: Event,
  ): void {
    const v = this.numberFrom(event);
    if (v === null) {
      return;
    }
    this.store.patchAudio(clip.id, { [field]: v } as Partial<EditorAudioClip>, field);
    const updated = this.store.project().audio.find((c) => c.id === clip.id);
    if (updated && field !== 'volume') {
      (event.target as HTMLInputElement).value = String(updated[field] ?? '');
    }
  }

  protected setText(
    clip: EditorTextClip,
    field: 'start' | 'end' | 'x' | 'y' | 'size',
    event: Event,
  ): void {
    const v = this.numberFrom(event);
    if (v === null) {
      return;
    }
    this.store.patchText(clip.id, { [field]: v } as Partial<EditorTextClip>, field);
    const updated = this.store.project().texts.find((c) => c.id === clip.id);
    if (updated && field !== 'x' && field !== 'y') {
      (event.target as HTMLInputElement).value = String(updated[field]);
    }
  }

  protected setTextContent(clip: EditorTextClip, event: Event): void {
    this.store.patchText(clip.id, { text: (event.target as HTMLTextAreaElement).value }, 'text');
  }

  protected setTextColor(clip: EditorTextClip, event: Event): void {
    this.store.patchText(
      clip.id,
      { color: (event.target as HTMLInputElement).value.toUpperCase() },
      'color',
    );
  }

  protected setProjectName(event: Event): void {
    this.store.setName((event.target as HTMLInputElement).value);
  }

  protected setFormat(event: Event): void {
    const fmt = FORMATS.find((f) => f.value === (event.target as HTMLSelectElement).value);
    if (fmt) {
      this.store.setFormat(fmt.width, fmt.height);
    }
  }

  protected addText(track = 0): void {
    this.store.addText(this.translate.instant('EDITOR.DEFAULT_TEXT'), track);
  }

  protected split(): void {
    if (!this.store.splitAtPlayhead()) {
      this.showNotice('EDITOR.ERRORS.SPLIT', 'info');
    }
  }

  protected onSelectProject(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    (event.target as HTMLSelectElement).value = this.projectId() ?? '';
    if (id) {
      void this.openProject(id);
    }
  }

  // ─── Exportar ───────────────────────────────────────────────────

  private exportProblem(): string | null {
    if (this.store.project().texts.some((t) => !t.text.trim())) {
      return 'EDITOR.ERRORS.EMPTY_TEXT';
    }
    return null;
  }

  /** Abre el modal de exportación (formato/códec y descarga a la PC). */
  protected async openExport(): Promise<void> {
    if (!this.canExport()) {
      return;
    }
    if (this.store.project().texts.some((t) => !t.text.trim())) {
      this.showNotice('EDITOR.ERRORS.EMPTY_TEXT', 'error');
      return;
    }
    this.pausePlayback();
    if (!(await this.ensureSaved())) {
      return;
    }
    this.exportOpen.set(true);
  }

  /** Espera el guardado en curso (autoguardado) y asegura que exista el proyecto. */
  private async ensureSaved(): Promise<boolean> {
    for (let i = 0; i < 40 && this.saving(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.projectId() && !this.store.dirty()) {
      return true;
    }
    const saved = await this.save();
    return saved || this.projectId() !== null;
  }

  // ─── Atajos ─────────────────────────────────────────────────────

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (typing) {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
    } else if (mod && key === 'y') {
      event.preventDefault();
      this.store.redo();
    } else if (!mod && key === ' ') {
      event.preventDefault();
      this.togglePlay();
    } else if (!mod && key === 's') {
      event.preventDefault();
      this.split();
    } else if (!mod && (key === 'delete' || key === 'backspace')) {
      event.preventDefault();
      this.store.removeSelected();
    }
  }

  // ─── Avisos ─────────────────────────────────────────────────────

  private showNotice(textOrKey: string, kind: NoticeKind, literal = false): void {
    clearTimeout(this.noticeTimer);
    this.notice.set({ text: literal ? textOrKey : this.translate.instant(textOrKey), kind });
    this.noticeTimer = setTimeout(() => this.notice.set(null), 6000);
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private errorText(err: unknown, fallbackKey: string): string {
    if (err instanceof HttpErrorResponse) {
      const message = (err.error as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && message) {
        return message;
      }
    }
    return this.translate.instant(fallbackKey);
  }
}
