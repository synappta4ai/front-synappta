import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize, forkJoin } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { Button } from 'primeng/button';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { AiModel, StatusOutput } from '@modules/agency/interfaces';
import { FileAsset } from '@modules/library/interfaces';
import { LibraryService } from '@modules/library/services';
import { ServerUrlPipe } from '@pipes/server-url.pipe';
import { UiIcon } from '@shared/components/ui-icon/ui-icon.component';
import { downloadRemoteFile } from '@utils/download-url';
import { environment } from '@env/environment';

import {
  STORYBOARD_DEFAULT_PANEL_COUNT,
  STORYBOARD_PANEL_OPTIONS,
  STORYBOARD_PIECE_CODE,
  STORYBOARD_RATIO,
  STORYBOARD_REF_KINDS,
  StoryboardPanelOption,
  StoryboardRefKind,
  TOOLS_LOADING_POSTER,
  TOOLS_LOADING_VIDEO,
} from '../../interfaces';
import { ToolsService } from '../../services';

const REF_MAX_BYTES = 10 * 1024 * 1024;
const REF_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg'];
const MIN_LOADING_MS = 650;
const PROGRESS_EXPECTED_MS = 90_000;

interface StoryboardReference {
  asset: FileAsset;
  kind: StoryboardRefKind;
}

type RefPreviewStage = 'original' | 'failed';

/**
 * Storyboard (Herramientas): convierte una idea y sus referencias en una hoja
 * horizontal de viñetas dibujada a lápiz por Gemini 3 Pro Image.
 */
@Component({
  selector: 'app-storyboard',
  imports: [FormsModule, TranslatePipe, Button, Message, Select, Tag, ServerUrlPipe, UiIcon],
  templateUrl: './storyboard.component.html',
  styleUrl: './storyboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoryboardComponent implements OnInit {
  private readonly toolsService = inject(ToolsService);
  private readonly libraryService = inject(LibraryService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiOrigin = environment.API_URL.replace(/\/api\/v1\/?$/, '');

  private readonly loadingMedia = viewChild<ElementRef<HTMLVideoElement>>('loadingMediaRef');

  constructor() {
    effect(() => {
      const video = this.loadingMedia()?.nativeElement;
      if (!video || !this.generating()) {
        return;
      }
      video.muted = true;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    });
    this.destroyRef.onDestroy(() => this.stopProgressRamp());
  }

  protected readonly panelOptions = STORYBOARD_PANEL_OPTIONS;
  protected readonly refKinds = STORYBOARD_REF_KINDS;
  protected readonly sheetRatio = STORYBOARD_RATIO;
  protected readonly loadingVideo = TOOLS_LOADING_VIDEO;
  protected readonly loadingPoster = TOOLS_LOADING_POSTER;

  protected readonly models = signal<AiModel[]>([]);
  protected readonly loadingModels = signal(true);
  protected readonly selectedModel = signal('');
  protected readonly activeModel = computed(
    () => this.models().find((m) => m.name === this.selectedModel()) ?? null,
  );

  protected readonly panelCount = signal(STORYBOARD_DEFAULT_PANEL_COUNT);
  protected readonly activePanel = computed<StoryboardPanelOption>(
    () =>
      this.panelOptions.find((option) => option.count === this.panelCount()) ??
      this.panelOptions[0],
  );
  protected readonly gridSummary = computed(
    () => `${this.activePanel().columns} × ${this.activePanel().rows}`,
  );

  protected readonly storyPrompt = signal('');
  protected readonly systemPrompt = signal('');
  protected readonly defaultSystemPrompt = signal('');
  protected readonly loadingPrompt = signal(false);
  protected readonly systemDirty = computed(
    () => this.systemPrompt() !== this.defaultSystemPrompt(),
  );

  protected readonly refs = signal<readonly StoryboardReference[]>([]);
  protected readonly refPreviewStage = signal<Readonly<Record<string, RefPreviewStage>>>({});
  protected readonly uploadingRefs = signal(false);

  protected readonly generating = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<readonly StatusOutput[]>([]);
  protected readonly generatedPanelCount = signal<number | null>(null);

  private progressTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly canGenerate = computed(
    () => !!this.selectedModel() && this.storyPrompt().trim().length > 0 && !this.generating(),
  );

  ngOnInit(): void {
    this.toolsService
      .listStoryboardModels()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (models) => {
          this.models.set(models);
          const first = models[0];
          if (first && !this.selectedModel()) {
            this.selectedModel.set(first.name);
          }
          this.loadingModels.set(false);
        },
        error: () => this.loadingModels.set(false),
      });
    this.loadSystemPrompt();
  }

  protected selectPanelCount(count: number): void {
    if (count === this.panelCount()) {
      return;
    }
    this.panelCount.set(count);
  }

  protected resetSystemPrompt(): void {
    this.systemPrompt.set(this.defaultSystemPrompt());
  }

  protected onRefsPicked(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = input ? Array.from(input.files ?? []) : [];
    if (input) {
      input.value = '';
    }
    const valid = files.filter((f) => REF_MIME_TYPES.includes(f.type) && f.size <= REF_MAX_BYTES);
    if (valid.length === 0) {
      return;
    }
    this.uploadingRefs.set(true);
    forkJoin(valid.map((file) => this.libraryService.uploadFile(file, 'images')))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadingRefs.set(false)),
      )
      .subscribe({
        next: (assets) =>
          this.refs.update((refs) => [
            ...assets.map((asset) => ({ asset, kind: 'character' as const })),
            ...refs,
          ]),
        error: () => this.error.set(this.translate.instant('TOOLS.STORYBOARD_REFS_ERROR')),
      });
  }

  protected setRefKind(id: string, kind: string): void {
    if (!this.refKinds.some((option) => option.key === kind)) {
      return;
    }
    this.refs.update((refs) =>
      refs.map((ref) => (ref.asset.id === id ? { ...ref, kind: kind as StoryboardRefKind } : ref)),
    );
  }

  protected removeRef(id: string): void {
    this.refs.update((refs) => refs.filter((ref) => ref.asset.id !== id));
    this.refPreviewStage.update((stages) => {
      const next = { ...stages };
      delete next[id];
      return next;
    });
  }

  /** Miniatura con fallback al original; vacío cuando no hay vista posible. */
  protected refImageSource(ref: StoryboardReference): string {
    const stage = this.refPreviewStage()[ref.asset.id];
    if (stage === 'failed') {
      return '';
    }
    if (stage === 'original') {
      return ref.asset.url ?? '';
    }
    return ref.asset.thumbnail_url ?? ref.asset.url ?? '';
  }

  protected onRefImageError(ref: StoryboardReference): void {
    const stage = this.refPreviewStage()[ref.asset.id];
    const canFallback = stage !== 'original' && !!ref.asset.thumbnail_url && !!ref.asset.url;
    this.refPreviewStage.update((stages) => ({
      ...stages,
      [ref.asset.id]: canFallback ? 'original' : 'failed',
    }));
  }

  protected generate(): void {
    const model = this.selectedModel();
    const prompt = this.composePrompt();
    if (!model || !prompt || this.generating()) {
      return;
    }
    const startedAt = Date.now();
    this.generating.set(true);
    this.progress.set(null);
    this.startProgressRamp();
    this.error.set(null);
    this.result.set([]);
    this.generatedPanelCount.set(null);
    this.toolsService
      .ensureStoryboardAnchor(this.translate.instant('TOOLS.STORYBOARD_ANCHOR'))
      .pipe(
        mergeMap((anchor) => {
          return this.toolsService.generateStoryboard({
            model,
            prompt,
            resolution: this.preferredResolution(),
            referenceIds: this.refs().map((ref) => ({
              id: ref.asset.id,
              name: ref.asset.filename,
            })),
            eventId: anchor.project.id,
            pieceId: anchor.piece.id,
            pieceCode: STORYBOARD_PIECE_CODE,
          });
        }),
        mergeMap((gen) => {
          this.applyOutputs(gen.outputs ?? []);
          return this.toolsService.trackStoryboard(gen.taskId);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.finishLoading(startedAt)),
      )
      .subscribe({
        next: (status) => {
          if (
            typeof status.progress_percent === 'number' &&
            status.progress_percent > (this.progress() ?? 0)
          ) {
            this.progress.set(status.progress_percent);
          }
          if (status.status === 'succeeded' || status.status === 'completed') {
            const outputs = status.outputs ?? [];
            if (outputs.length > 0) {
              this.applyOutputs(outputs);
            } else if (this.result().length === 0) {
              this.error.set(this.translate.instant('TOOLS.STORYBOARD_NO_OUTPUT'));
            }
          } else if (status.status === 'failed' || status.status === 'cancelled') {
            this.error.set(this.describeError(status.error ?? status.status));
          }
        },
        error: (err: unknown) => this.error.set(this.describeError(err)),
      });
  }

  protected download(): void {
    const output = this.result()[0];
    if (!output?.url) {
      return;
    }
    void downloadRemoteFile(
      this.absoluteUrl(output.url),
      `storyboard-${this.generatedPanelCount() ?? this.panelCount()}.png`,
    );
  }

  private describeError(err: unknown): string {
    const http = err as Partial<HttpErrorResponse> | null;
    const payload = http?.error;
    let message = '';

    if (typeof payload === 'string') {
      message = payload;
    } else if (payload && typeof payload === 'object') {
      const body = payload as { message?: unknown };
      if (typeof body.message === 'string') {
        message = body.message;
      }
    }
    if (!message && typeof http?.message === 'string') {
      message = http.message;
    }

    if (
      http?.status === 429 ||
      /RESOURCE_EXHAUSTED|free_tier|free tier|Quota exceeded|"code"\s*:\s*429/i.test(message)
    ) {
      return this.translate.instant('TOOLS.STORYBOARD_QUOTA_ERROR');
    }

    return this.providerMessage(message) || this.translate.instant('TOOLS.STORYBOARD_ERROR');
  }

  /** El back puede devolver el JSON del proveedor como string dentro de message. */
  private providerMessage(message: string): string {
    const trimmed = message.trim();
    if (!trimmed.startsWith('{')) {
      return trimmed;
    }
    try {
      const body = JSON.parse(trimmed) as {
        error?: { message?: string };
        message?: string;
      };
      return body.error?.message ?? body.message ?? trimmed;
    } catch {
      return trimmed;
    }
  }

  private applyOutputs(outputs: readonly StatusOutput[]): void {
    if (outputs.length === 0) {
      return;
    }
    this.result.set(outputs);
    this.generatedPanelCount.set(this.panelCount());
    this.progress.set(100);
  }

  private startProgressRamp(): void {
    this.stopProgressRamp();
    const startedAt = Date.now();
    this.progress.set(1);
    this.progressTimer = setInterval(() => {
      const ratio = (Date.now() - startedAt) / PROGRESS_EXPECTED_MS;
      const pct = Math.min(95, Math.round(3 + 92 * (1 - Math.exp(-1.5 * ratio))));
      this.progress.set(pct);
    }, 400);
  }

  private stopProgressRamp(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private finishLoading(startedAt: number): void {
    this.stopProgressRamp();
    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
    if (wait === 0) {
      this.generating.set(false);
      return;
    }
    setTimeout(() => this.generating.set(false), wait);
  }

  private loadSystemPrompt(): void {
    this.loadingPrompt.set(true);
    this.toolsService
      .loadStoryboardPrompt()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingPrompt.set(false)),
      )
      .subscribe({
        next: (text) => {
          const clean = text.trim();
          this.defaultSystemPrompt.set(clean);
          this.systemPrompt.set(clean);
        },
        error: () => this.error.set(this.translate.instant('TOOLS.LOADING_PROMPT')),
      });
  }

  private composePrompt(): string {
    const story = this.storyPrompt().trim();
    if (!story) {
      return '';
    }
    const panel = this.activePanel();
    const references = this.refs();
    const manifest =
      references.length === 0
        ? '- No reference images. Build the visual DNA from the story idea only.'
        : references
            .map(
              (ref, index) =>
                `- Reference ${index + 1} [${this.promptLabel(ref.kind)}]: ${ref.asset.filename}`,
            )
            .join('\n');
    const panelDirections = this.panelPositions(panel)
      .map(
        (position, index) =>
          `- Panel ${index + 1} (${position}): fill the header with the actual scene number, short title, shot type, and camera angle; draw the matching story beat inside the black-bordered 16:9 frame; write the action or dialogue on the three ruled lines below.`,
      )
      .join('\n');

    return [
      this.systemPrompt().trim(),
      'USER STORY IDEA:',
      story,
      'STORYBOARD SPEC:',
      `- Exactly ${panel.count} panels on a horizontal 3:2 sheet. Every panel contains a 16:9 frame.`,
      `- Grid layout: ${panel.columns} columns by ${panel.rows} rows.`,
      '- Reading order: left to right, top to bottom.',
      '- Every panel must carry its header, central frame, and three-line footer.',
      panelDirections,
      'REFERENCE MANIFEST:',
      manifest,
      'FINAL RENDER DIRECTIVE:',
      'Render the finished image now. Output only the image; do not return JSON, Markdown, code, or explanatory text. Keep every header and footer line legible and preserve the exact reference identity across all panels.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private panelPositions(panel: StoryboardPanelOption): string[] {
    const positions: string[] = [];
    for (let row = 1; row <= panel.rows; row++) {
      for (let column = 1; column <= panel.columns; column++) {
        positions.push(`row ${row}, column ${column}`);
      }
    }
    return positions;
  }

  private promptLabel(kind: StoryboardRefKind): string {
    return this.refKinds.find((option) => option.key === kind)?.promptLabel ?? 'REFERENCE';
  }

  private preferredResolution(): string | undefined {
    const resolutions = this.activeModel()?.defaults?.resolutions ?? [];
    return resolutions.includes('2K') ? '2K' : undefined;
  }

  private absoluteUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    return `${this.apiOrigin}${url.startsWith('/') ? url : `/${url}`}`;
  }
}
