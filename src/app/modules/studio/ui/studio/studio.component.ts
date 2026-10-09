import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Popover } from 'primeng/popover';
import { Select } from 'primeng/select';
import { PrimeTemplate } from 'primeng/api';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Message } from 'primeng/message';

import type { GenerateRequest, Modality } from '@modules/agency/interfaces';
import { AgencyService } from '@modules/agency/services';
import { LibraryService } from '@modules/library/services';
import {
  FileAsset,
  Ingredient,
  IngredientWithFiles,
  parseElementMetadata,
} from '@modules/library/interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project } from '@modules/events/interfaces';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { GenerationEventsStore } from '@core/store/generation.events';
import { UserSessionStore } from '@core/store/user.session';
import { environment } from '@env/environment';

import { StudioService } from '../../services/studio.service';
import { StudioModel, StudioModelType, StudioTake } from '../../interfaces';
import { AssetPickerDialogComponent } from '@shared/components/index';
import { AssetEditDialogComponent } from '@shared/components/asset-edit-dialog/asset-edit-dialog';
import { SlidePillDirective } from '@shared/components/slide-pill/slide-pill.directive';
import { TiltDirective } from '@shared/components/tilt/tilt.directive';
import { ImgFadeDirective } from '@shared/components/img-fade/img-fade.directive';

interface RatioOption {
  label: string;
  value: string;
  w: number;
  h: number;
}

interface RefSlotDef {
  key: 'character' | 'location' | 'props';
  label: string;
  hint: string;
}

const REF_SLOT_DEFS: RefSlotDef[] = [
  { key: 'character', label: 'Personaje', hint: 'png, jpeg' },
  { key: 'location', label: 'Localización', hint: 'png, jpeg' },
  { key: 'props', label: 'Props', hint: 'png, jpeg' },
];

/** Fila del menú @: recurso (filename) o ingrediente (id de elemento o nombre). */
interface MentionRow {
  key: string;
  kind: 'asset' | 'ingredient';
  asset?: FileAsset;
  ingredient?: Ingredient;
  wrapper?: IngredientWithFiles;
  label: string;
}

@Component({
  selector: 'app-studio',
  imports: [
    FormsModule,
    DatePipe,
    Button,
    Dialog,
    Popover,
    Select,
    PrimeTemplate,
    Tag,
    Tooltip,
    Message,
    ServerUrlPipe,
    AssetPickerDialogComponent,
    AssetEditDialogComponent,
    SlidePillDirective,
    TiltDirective,
    ImgFadeDirective,
  ],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onShortcut($event)',
    '(document:click)': 'onDocClick($event)',
    '(window:resize)': 'onWinResize()',
  },
})
export class StudioComponent {
  private readonly studioService = inject(StudioService);
  private readonly agencyService = inject(AgencyService);
  private readonly libraryService = inject(LibraryService);
  private readonly eventsService = inject(EventsService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly platformId = inject(PLATFORM_ID);

  // ─── Workspace layout (solo UI): anchos de columnas redimensionables ──
  private static readonly COLS_KEY = 'studio:colW';
  private static readonly COL_MIN = 260;
  private static readonly COL_MAX = 520;
  protected readonly colLeft = signal(340);
  protected readonly colRight = signal(320);

  // ─── Catalog ───────────────────────────────────────────────────
  protected readonly models = signal<StudioModel[]>([]);
  protected readonly loadingModels = signal(false);
  protected readonly selectedModel = signal<StudioModel | null>(null);

  /** true solo para modelos que corren en el inference worker (downloaded):
      prompt negativo y seed se muestran/usan únicamente para esos modelos. */
  protected readonly workerModel = computed(() => this.selectedModel()?.type === 'downloaded');

  protected readonly videoModels = computed(() =>
    this.models().filter((m) => m.modality === 'video'),
  );
  protected readonly imageModels = computed(() =>
    this.models().filter((m) => m.modality === 'image'),
  );

  protected readonly mode = signal<'video' | 'image'>('video');
  protected readonly modeModels = computed(() =>
    this.mode() === 'video' ? this.videoModels() : this.imageModels(),
  );

  // ─── Prompt & params ───────────────────────────────────────────
  protected readonly prompt = signal('');
  protected readonly negativePrompt = signal('');
  protected readonly ratio = signal('16:9');
  protected readonly resolution = signal('720p');
  protected readonly duration = signal(5);
  protected readonly seed = signal('');

  protected readonly ratioOptions: RatioOption[] = [
    { label: '16:9', value: '16:9', w: 16, h: 9 },
    { label: '9:16', value: '9:16', w: 9, h: 16 },
    { label: '1:1', value: '1:1', w: 1, h: 1 },
    { label: '4:3', value: '4:3', w: 4, h: 3 },
    { label: '3:4', value: '3:4', w: 3, h: 4 },
    { label: '21:9', value: '21:9', w: 21, h: 9 },
  ];
  protected readonly ratioSelectOptions = this.ratioOptions.map((r) => ({
    label: r.label,
    value: r.value,
  }));

  /**
   * Ratio dibujado en el canvas del visor: el del take seleccionado cuando
   * hay uno (cada toma guarda el suyo), o el elegido en el formulario.
   */
  protected readonly canvasRatio = computed<{ w: number; h: number }>(() => {
    const take = this.selectedTake();
    const value = (take?.ratio || this.ratio() || '16:9').trim();
    const known = this.ratioOptions.find((r) => r.value === value);
    if (known) {
      return { w: known.w, h: known.h };
    }
    const [w, h] = value.split(':').map((n) => parseFloat(n));
    return w > 0 && h > 0 ? { w, h } : { w: 16, h: 9 };
  });

  /** Aspect numérico (w/h) para la CSS var --canvas-ar del visor. */
  protected readonly canvasAr = computed(() => {
    const { w, h } = this.canvasRatio();
    return (w / h).toFixed(4);
  });

  /** Resoluciones que soporta el modelo elegido (fallback: 480p-1080p). */
  protected readonly resolutionOptions = computed<string[]>(() => {
    const res = this.selectedModel()?.source?.defaults?.resolutions;
    return res && res.length > 0 ? [...res] : ['480p', '720p', '1080p'];
  });

  /** Ratios que soporta el modelo elegido (null = mostrar todos). */
  protected readonly allowedRatios = computed<Set<string> | null>(() => {
    const ratios = this.selectedModel()?.source?.defaults?.ratios;
    return ratios && ratios.length > 0 ? new Set(ratios) : null;
  });

  protected readonly visibleRatioOptions = computed<RatioOption[]>(() => {
    const allowed = this.allowedRatios();
    return allowed ? this.ratioOptions.filter((r) => allowed.has(r.value)) : this.ratioOptions;
  });
  protected readonly refSlotDefs = REF_SLOT_DEFS;
  protected readonly refSlots = signal<Record<RefSlotDef['key'], string | null>>({
    character: null,
    location: null,
    props: null,
  });
  /** Slot recibiendo upload en este momento (para el spinner del slot). */
  protected readonly uploadingSlot = signal<RefSlotDef['key'] | null>(null);
  /** Límite de tamaño por imagen de referencia. */
  protected readonly maxRefBytes = 10 * 1024 * 1024;
  protected readonly maxRefLabel = '10 MB';
  protected readonly maxSelectedRefs = 12;
  protected readonly refError = signal<string | null>(null);
  private refErrorTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Duration range allowed by the selected model. API models declare their
   * supported durations in defaults.durations (e.g. Seedance 2.5 goes up to
   * 60s); downloaded worker models fall back to the 3–10s local range.
   */
  protected readonly durationRange = computed<{ min: number; max: number; step: number }>(() => {
    const durations = this.selectedModel()?.source?.defaults?.durations ?? [];
    const valid = [...new Set(durations.filter((d) => d > 0))].sort((a, b) => a - b);
    if (valid.length === 0) {
      return { min: 3, max: 10, step: 1 };
    }
    return { min: valid[0], max: valid[valid.length - 1], step: 1 };
  });

  /** Human hint under the slider: model-supported span. */
  protected readonly durationHint = computed(() => {
    const { min, max } = this.durationRange();
    const fmt = (s: number) =>
      s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? ' ' + (s % 60) + 's' : ''}` : `${s}s`;
    return min === max ? `Solo ${fmt(min)}` : `${fmt(min)} – ${fmt(max)}`;
  });

  // ─── Reference assets ──────────────────────────────────────────
  protected readonly assets = signal<FileAsset[]>([]);
  protected readonly selectedAssetIds = signal<Set<string>>(new Set());
  protected readonly loadingAssets = signal(false);
  protected readonly uploading = signal(false);
  protected readonly showAssetGallery = signal(false);
  /** true tras auto-abrir Referencias por una mención (una sola vez). */
  private refsAutoOpened = false;

  /**
   * Grilla del panel Referencias (máx. 4): los seleccionados — incluidos los
   * recursos expandidos de los ingredientes citados @ — van primero, para
   * que sus miniaturas se vean aunque la biblioteca sea grande.
   */
  protected readonly refGridAssets = computed<FileAsset[]>(() => {
    const selected = this.selectedAssetIds();
    const list = this.assets();
    return [
      ...list.filter((a) => selected.has(a.id)),
      ...list.filter((a) => !selected.has(a.id)),
    ].slice(0, 4);
  });

  // ─── Menciones @ en el prompt ─────────────────────────────────
  /** Assets citados en el prompt como @Nombre (en orden de aparición). */
  protected readonly mentionedAssets = signal<FileAsset[]>([]);
  /** Ingredientes citados en el prompt como @Nombre (expanden a sus archivos). */
  protected readonly mentionedIngredients = signal<IngredientWithFiles[]>([]);
  /** Catálogo de ingredientes (con sus archivos) disponible para el menú @. */
  protected readonly ingredients = signal<IngredientWithFiles[]>([]);
  /** true mientras el menú @ está abierto con candidatos filtrados. */
  protected readonly mentionMenuOpen = signal(false);
  /** Consulta activa tras el @ (sin incluirlo). */
  protected readonly mentionQuery = signal('');
  /** Índice resaltado en el menú de candidatos (teclado). */
  protected readonly mentionHighlight = signal(0);
  /** Posición (en px) del menú relativa al wrapper del textarea. */
  protected readonly mentionMenuPos = signal<{ top: number; left: number } | null>(null);
  /** @-query abierto actualmente: [start, end) dentro del texto. */
  private mentionRange: { start: number; end: number } | null = null;
  @ViewChild('promptTextarea') private promptTextareaRef?: ElementRef<HTMLTextAreaElement>;

  /** Textarea del prompt (viewChild con locator string devuelve ElementRef). */
  private get promptTextarea(): HTMLTextAreaElement | undefined {
    return this.promptTextareaRef?.nativeElement;
  }

  /** Filas del menú @: primero ids de elemento, luego recursos, luego nombres. */
  protected readonly mentionRows = computed<MentionRow[]>(() => {
    const query = this.mentionQuery().trim().toLowerCase();
    const mentionedAssets = new Set(this.mentionedAssets().map((a) => a.id));
    const mentionedIngs = new Set(this.mentionedIngredients().map((i) => i.ingredient.name));
    const matches = (label: string) => !query || label.toLowerCase().includes(query);

    const rows: MentionRow[] = [];
    const seenIngs = new Set<string>();

    // 1) Elementos con @id: tienen prioridad sobre filenames y nombres.
    for (const ing of this.ingredients()) {
      const id = this.elementIdOf(ing.ingredient);
      if (id && !mentionedIngs.has(ing.ingredient.name) && matches(id)) {
        rows.push({
          key: `ing:${ing.ingredient.id}`,
          kind: 'ingredient',
          ingredient: ing.ingredient,
          wrapper: ing,
          label: id,
        });
        seenIngs.add(ing.ingredient.id);
      }
    }

    // 2) Recursos (imágenes) de la biblioteca.
    for (const a of this.assets()) {
      if (
        (a.mime_type ?? '').startsWith('image/') &&
        !mentionedAssets.has(a.id) &&
        matches(a.filename)
      ) {
        rows.push({ key: `asset:${a.id}`, kind: 'asset', asset: a, label: a.filename });
      }
    }

    // 3) Ingredientes sin id (o cuyo id no matcheó), por nombre.
    for (const ing of this.ingredients()) {
      if (seenIngs.has(ing.ingredient.id) || mentionedIngs.has(ing.ingredient.name)) {
        continue;
      }
      if (matches(ing.ingredient.name)) {
        rows.push({
          key: `ing:${ing.ingredient.id}`,
          kind: 'ingredient',
          ingredient: ing.ingredient,
          wrapper: ing,
          label: ing.ingredient.name,
        });
      }
    }

    return rows.slice(0, 8);
  });

  /** Compat: filas planas del menú. */
  protected readonly mentionCandidates = computed(() => this.mentionRows());

  /** Tokens @ del texto para el overlay: válidos = asset conocido. */
  protected readonly promptMentionTokens = computed<
    { start: number; end: number; filename: string; valid: boolean }[]
  >(() => {
    const byName = this.mentionNameMap();
    return this.scanMentionTokens(this.prompt(), byName).map((t) => ({
      start: t.start,
      end: t.end,
      filename: t.name,
      valid: true,
    }));
  });

  /**
   * Mapa de nombres citables tras un @: filenames de assets + nombres de
   * ingredientes (un ingrediente no pisa el nombre de un asset existente).
   */
  private mentionNameMap(): Map<
    string,
    { kind: 'asset' | 'ingredient'; asset?: FileAsset; ing?: IngredientWithFiles }
  > {
    const map = new Map<
      string,
      { kind: 'asset' | 'ingredient'; asset?: FileAsset; ing?: IngredientWithFiles }
    >();
    // IDs de elemento con prioridad: si un id coincide con un filename o con
    // un nombre de ingrediente, manda el id.
    for (const ing of this.ingredients()) {
      const id = this.elementIdOf(ing.ingredient);
      if (id && !map.has(id)) {
        map.set(id, { kind: 'ingredient', ing });
      }
    }
    for (const a of this.assets()) {
      if (!map.has(a.filename)) {
        map.set(a.filename, { kind: 'asset', asset: a });
      }
    }
    for (const ing of this.ingredients()) {
      if (!map.has(ing.ingredient.name)) {
        map.set(ing.ingredient.name, { kind: 'ingredient', ing });
      }
    }
    return map;
  }

  /** ID de elemento citable del ingrediente ('@Mario' → 'Mario'); '' si no tiene. */
  private elementIdOf(ing: Ingredient): string {
    const raw = parseElementMetadata(ing.metadata).element_id ?? '';
    return raw.replace(/^@/, '');
  }

  /** Etiqueta citable del ingrediente: id de elemento con prioridad, si existe. */
  protected mentionLabelOf(ing: IngredientWithFiles): string {
    return this.elementIdOf(ing.ingredient) || ing.ingredient.name;
  }

  /**
   * Escanea el texto buscando menciones @citables: tras cada @ matchea el
   * nombre conocido MÁS LARGO (ingredientes y filenames pueden contener
   * espacios, así que el regex por palabra no alcanza).
   * Devuelve tokens [start, end) solo para nombres presentes en el mapa.
   */
  private scanMentionTokens(
    text: string,
    byName: Map<
      string,
      { kind: 'asset' | 'ingredient'; asset?: FileAsset; ing?: IngredientWithFiles }
    >,
  ): { start: number; end: number; name: string }[] {
    if (!byName.size) {
      return [];
    }
    const sorted = [...byName.keys()].sort((a, b) => b.length - a.length);
    const tokens: { start: number; end: number; name: string }[] = [];
    let i = text.indexOf('@');
    while (i !== -1) {
      const rest = text.slice(i + 1);
      const name = sorted.find((n) => rest.startsWith(n));
      if (name) {
        tokens.push({ start: i, end: i + 1 + name.length, name });
        i = text.indexOf('@', i + 1 + name.length);
      } else {
        i = text.indexOf('@', i + 1);
      }
    }
    return tokens;
  }

  /** Quita los tokens @citables del texto (deja el prompt limpio para el backend). */
  private stripMentions(text: string): string {
    const byName = this.mentionNameMap();
    let out = '';
    let cursor = 0;
    for (const t of this.scanMentionTokens(text, byName)) {
      out += text.slice(cursor, t.start);
      cursor = t.end;
    }
    return out + text.slice(cursor);
  }

  /**
   * HTML del overlay que espeja el textarea: texto plano con los tokens @
   * de assets conocidos envueltos en <span class="mention-token">. El escape
   * de HTML evita inyección desde filenames con caracteres especiales.
   */
  protected readonly mentionOverlayHtml = computed<string>(() => {
    const text = this.prompt();
    if (!text) {
      return '';
    }
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const byName = this.mentionNameMap();
    let html = '';
    let cursor = 0;
    for (const t of this.scanMentionTokens(text, byName)) {
      html += escape(text.slice(cursor, t.start));
      html += `<span class="mention-token">${escape(text.slice(t.start, t.end))}</span>`;
      cursor = t.end;
    }
    html += escape(text.slice(cursor));
    return html + '\n';
  });

  /** Re-parsea las menciones @ válidas (assets e ingredientes) del texto. */
  private syncMentionsFromText(): void {
    const byName = this.mentionNameMap();
    const foundAssets: FileAsset[] = [];
    const foundIngs: IngredientWithFiles[] = [];
    const seenAssets = new Set<string>();
    const seenIngs = new Set<string>();
    for (const t of this.scanMentionTokens(this.prompt(), byName)) {
      const entry = byName.get(t.name);
      if (!entry) {
        continue;
      }
      if (entry.kind === 'asset' && entry.asset && !seenAssets.has(entry.asset.id)) {
        seenAssets.add(entry.asset.id);
        foundAssets.push(entry.asset);
      } else if (
        entry.kind === 'ingredient' &&
        entry.ing &&
        !seenIngs.has(entry.ing.ingredient.id)
      ) {
        seenIngs.add(entry.ing.ingredient.id);
        foundIngs.push(entry.ing);
      }
    }
    this.mentionedAssets.set(foundAssets);
    this.mentionedIngredients.set(foundIngs);
  }

  /** Ingrediente citado → TODOS sus file_ids vinculados (via /ingredients). */
  private assetsOfIngredient(ing: IngredientWithFiles): FileAsset[] {
    const byId = new Map(this.assets().map((a) => [a.id, a]));
    const out: FileAsset[] = [];
    for (const file of ing.files ?? []) {
      const known = byId.get(file.file_id);
      if (known) {
        out.push(known);
        continue;
      }
      // Recurso no presente en la lista local: sintetizarlo desde el índice.
      out.push({
        id: file.file_id,
        filename: file.filename ?? file.file_id,
        url: file.url,
        thumbnail_url: file.thumbnail_url,
        mime_type: file.mime_type,
        size: null,
        sha256: null,
        category: file.category,
        format: file.format,
        storage: null,
        trashed: false,
        ingredients: [
          { id: ing.ingredient.id, type: ing.ingredient.type, name: ing.ingredient.name },
        ],
        created_at: '',
        updated_at: '',
      });
    }
    return out;
  }

  /** Conteo de recursos de un ingrediente (para el chip). */
  protected assetsOfIngredientCount(ing: IngredientWithFiles): number {
    return (ing.files ?? []).length;
  }

  /** Sincroniza selección y slots con las menciones @ (recursos + ingredientes). */
  private syncSelectionWithMentions(): void {
    // Los ingredientes expanden a TODOS sus recursos citables.
    const expanded: FileAsset[] = [...this.mentionedAssets()];
    for (const ing of this.mentionedIngredients()) {
      for (const asset of this.assetsOfIngredient(ing)) {
        if (!expanded.some((a) => a.id === asset.id)) {
          expanded.push(asset);
        }
      }
    }

    // Selección: toda mención/expansión queda seleccionada (hasta el máximo).
    this.selectedAssetIds.update((prev) => {
      const next = new Set(prev);
      for (const a of expanded) {
        if (next.size >= this.maxSelectedRefs) break;
        next.add(a.id);
      }
      return next;
    });

    // Slots: llenar vacíos con menciones tipadas por orden (character → location → props).
    const slots = { ...this.refSlots() };
    const keys: RefSlotDef['key'][] = ['character', 'location', 'props'];
    for (const asset of expanded) {
      if ((asset.mime_type ?? '').startsWith('image/')) {
        // Idempotencia: un asset ya ubicado en algún slot no se vuelve a colocar.
        if (Object.values(slots).includes(asset.id)) {
          continue;
        }
        const free = keys.find((k) => !slots[k]);
        if (free) {
          slots[free] = asset.id;
        }
      }
    }
    this.refSlots.set(slots);

    // Auto-abrir Referencias la primera vez que una mención agrega refs.
    const mentions = this.mentionedAssets().length + this.mentionedIngredients().length;
    if (mentions === 0) {
      this.refsAutoOpened = false;
    } else if (!this.refsAutoOpened) {
      this.refsAutoOpened = true;
      this.showAssetGallery.set(true);
    }
  }

  /** ngModelChange del textarea: re-parsea menciones y menú @. */
  protected onPromptInput(value: string): void {
    this.prompt.set(value);
    this.syncMentionsFromText();
    this.syncSelectionWithMentions();
    this.updateMentionState();
  }

  /** Detecta el @ bajo el cursor y abre/cierra/actualiza el menú. */
  private updateMentionState(): void {
    const textarea = this.promptTextarea;
    if (!textarea) {
      this.closeMentionMenu();
      return;
    }
    const caret = textarea.selectionStart ?? 0;
    const upto = this.prompt().slice(0, caret);
    const match = upto.match(/@([^@\s]*)$/);
    if (!match) {
      this.closeMentionMenu();
      return;
    }
    const start = caret - match[0].length;
    this.mentionRange = { start, end: caret };
    this.mentionQuery.set(match[1]);
    if (this.mentionCandidates().length === 0) {
      this.closeMentionMenu();
      return;
    }
    if (!this.mentionMenuOpen()) {
      this.mentionHighlight.set(0);
    }
    this.mentionMenuOpen.set(true);
    this.mentionMenuPos.set(this.computeMenuPos(textarea, start));
  }

  /** Posición del menú: sobre el caret usando un espejo de texto oculto. */
  private computeMenuPos(
    textarea: HTMLTextAreaElement,
    caretIndex: number,
  ): { top: number; left: number } {
    const mirror = document.createElement('div');
    const style = getComputedStyle(textarea);
    const props = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'paddingTop',
      'paddingLeft',
      'paddingRight',
      'borderWidth',
      'boxSizing',
      'width',
      'whiteSpace',
      'wordWrap',
    ] as const;
    for (const prop of props) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mirror.style as any)[prop] = (style as any)[prop];
    }
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.textContent = this.prompt().slice(0, caretIndex);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);
    const wrapperRect = (textarea.parentElement ?? textarea).getBoundingClientRect();
    const hostRect = textarea.getBoundingClientRect();
    const styleFloat = parseFloat(style.paddingTop) || 0;
    const left = Math.max(
      0,
      Math.min(
        markerRect.left - mirrorRect.left + (parseFloat(style.paddingLeft) || 0),
        wrapperRect.width - 280,
      ),
    );
    // Línea del caret (top relativo al textarea) + padding + borde del host.
    const caretLineTop = markerRect.top - mirrorRect.top + styleFloat;
    const hostOffsetTop = hostRect.top - wrapperRect.top + (parseFloat(style.borderTopWidth) || 0);
    const below = hostOffsetTop + caretLineTop + 8;
    // Si el menú (240px) no entra por abajo, abrir hacia arriba.
    const top =
      below + 240 > wrapperRect.height ? Math.max(0, hostOffsetTop + caretLineTop - 248) : below;
    return { top, left };
  }

  protected closeMentionMenu(): void {
    this.mentionMenuOpen.set(false);
    this.mentionQuery.set('');
    this.mentionRange = null;
    this.mentionMenuPos.set(null);
  }

  /** Inserta la mención elegida (recurso o ingrediente) en el token @ parcial. */
  protected pickMention(row: MentionRow): void {
    const range = this.mentionRange;
    const textarea = this.promptTextarea;
    if (!range || !textarea) {
      return;
    }
    const label = row.label;
    const text = this.prompt();
    const insert = `@${label} `;
    const next = text.slice(0, range.start) + insert + text.slice(range.end);
    this.prompt.set(next);
    this.closeMentionMenu();
    this.syncMentionsFromText();
    this.syncSelectionWithMentions();
    const caret = range.start + insert.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  /** Teclas del menú @: flechas, Enter/Tab eligen, Escape cierra. */
  protected onMentionKeydown(event: KeyboardEvent): void {
    if (!this.mentionMenuOpen()) {
      return;
    }
    const candidates = this.mentionCandidates();
    if (candidates.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.mentionHighlight.update((i) => (i + 1) % candidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.mentionHighlight.update((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const picked = candidates[this.mentionHighlight()];
      if (picked) {
        this.pickMention(picked);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMentionMenu();
    }
  }

  /** Quita una mención @ del texto (chip de recurso o ingrediente). */
  protected removeMention(target: FileAsset | IngredientWithFiles): void {
    const isAsset = 'filename' in target;
    // Un ingrediente puede estar citado por id de elemento o por nombre.
    const labels = isAsset
      ? [target.filename]
      : [...new Set([this.mentionLabelOf(target), target.ingredient.name])];
    const body = labels
      .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const re = new RegExp(`@(${body})\\s?`, 'g');
    this.prompt.update((text) => text.replace(re, ''));
    // Quitar la mención también libera sus recursos: selección y slots.
    const removedIds = new Set(
      isAsset ? [target.id] : this.assetsOfIngredient(target).map((a) => a.id),
    );
    this.selectedAssetIds.update((prev) => {
      const next = new Set(prev);
      for (const id of removedIds) {
        next.delete(id);
      }
      return next;
    });
    this.refSlots.update((slots) => {
      const out = { ...slots };
      for (const key of Object.keys(out) as RefSlotDef['key'][]) {
        if (out[key] && removedIds.has(out[key]!)) {
          out[key] = null;
        }
      }
      return out;
    });
    this.syncMentionsFromText();
    this.syncSelectionWithMentions();
  }

  /** Icono PrimeNG por tipo de ingrediente (menú y chips). */
  protected ingredientIcon(type: string): string {
    switch (type) {
      case 'character':
        return 'md md-person';
      case 'location':
        return 'md md-place';
      case 'prop':
        return 'md md-inventory_2';
      default:
        return 'md md-label';
    }
  }

  /** Etiqueta legible del tipo de ingrediente. */
  protected ingredientTypeLabel(type: string): string {
    switch (type) {
      case 'character':
        return 'Personaje';
      case 'location':
        return 'Locación';
      case 'prop':
        return 'Prop';
      default:
        return type;
    }
  }

  /** Carga el catálogo de ingredientes para el menú @. */
  private loadIngredients(): void {
    this.libraryService
      .listIngredients()
      .pipe(catchError(() => EMPTY))
      .subscribe((ings) => this.ingredients.set(ings));
  }

  // ─── Proyecto (centralización de recursos) ──────────────
  protected readonly projects = signal<Project[]>([]);
  protected readonly projectOptions = computed(() =>
    this.projects().map((p) => ({ label: p.name, value: p.id })),
  );
  protected readonly selectedProjectId = signal<string | null>(null);
  protected readonly loadingProjects = signal(false);
  protected readonly selectedProject = computed(
    () => this.projects().find((p) => p.id === this.selectedProjectId()) ?? null,
  );
  /** Nombre tipeado para la creación rápida de proyecto (modal). */
  protected readonly newProjectName = signal('');
  /** true mientras crea el proyecto rápido. */
  protected readonly creatingProject = signal(false);

  // ─── Takes (global generation-events store) ───────────────────
  protected readonly eventsStore = inject(GenerationEventsStore);
  protected readonly takes = this.eventsStore.events;
  protected readonly selectedTakeId = signal<string | null>(null);
  protected readonly selectedTake = computed(
    () => this.takes().find((t) => t.id === this.selectedTakeId()) ?? null,
  );

  // ─── Modal de detalle del take ───────────────────────────
  protected readonly takeDetailId = signal<string | null>(null);
  protected readonly takeDetailVisible = signal(false);
  /** Toma mostrada en el modal (null mientras está cerrado). */
  protected readonly detailTake = computed(() =>
    this.takeDetailVisible()
      ? this.takes().find((t) => t.id === this.takeDetailId()) ?? null
      : null,
  );
  /** Nombre del usuario en sesión (las tomas del reel son propias). */
  protected readonly sessionUserLabel = computed(() => {
    const u = this.sessionStore.currentUser();
    if (!u) return '';
    return [u.name, u.surname].filter(Boolean).join(' ').trim() || u.username;
  });
  protected readonly activeTakes = this.eventsStore.active;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private takeCounter = 0;

  // ─── Historial por día: agrupación del reel + recuperar sesión ──
  protected readonly sessionDate = this.eventsStore.sessionDate;

  // Selector de día del historial: dropdown con los días que tienen
  // generaciones de video del usuario. Muestra 10 y el scroll al fondo
  // revela más (y pagina ventanas más viejas contra el backend).
  private static readonly HISTORY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
  private static readonly HISTORY_PAGE_LIMIT = 200;
  /** Ventanas extra auto-cargadas cuando aún no hay 10 días (panel sin
      overflow: el scroll no dispararía la paginación). */
  private static readonly MAX_AUTOFILL_FETCHES = 6;

  protected readonly dayMenuOpen = signal(false);
  /** Días (ISO desc) con generaciones de video, según el backend. */
  protected readonly historyDays = signal<{ key: string; label: string; count: number }[]>([]);
  /** Días visibles del catálogo. */
  protected readonly dayWindow = signal(10);
  protected readonly loadingDays = signal(false);
  protected readonly visibleDayOptions = computed(() =>
    this.historyDays().slice(0, this.dayWindow()),
  );

  /** Borde inferior (ms) de la última ventana consultada; null = sin consultar. */
  private oldestDayFetchMs: number | null = null;
  private daysRequested = false;
  /** La última ventana no trajo generaciones: no hay días más viejos. */
  private daysExhausted = false;
  private autoFillFetches = 0;
  private readonly destroyRef = inject(DestroyRef);

  protected toggleDayMenu(): void {
    const next = !this.dayMenuOpen();
    this.dayMenuOpen.set(next);
    if (next) {
      this.ensureHistoryDays();
    }
  }

  /** Scroll del panel al fondo: revela días cargados y pagina el backend. */
  protected onDayPanelScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 24) {
      return;
    }
    this.revealMoreHistoryDays();
  }

  /** Elige un día del historial (null = volver al reel en vivo). */
  protected pickDay(key: string | null): void {
    this.dayMenuOpen.set(false);
    if (!key) {
      this.clearSession();
      return;
    }
    this.eventsStore.loadSession(key);
  }

  /** Cierra el dropdown si el click cae fuera del selector. */
  protected onDocClick(event: MouseEvent): void {
    if (!this.dayMenuOpen()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.reel-day-select')) {
      return;
    }
    this.dayMenuOpen.set(false);
  }

  /** Consulta (una sola vez) los días con generaciones recientes. */
  private ensureHistoryDays(): void {
    if (this.daysRequested || !isPlatformBrowser(this.platformId)) {
      return;
    }
    this.daysRequested = true;
    this.fetchHistoryDays(Date.now());
  }

  private revealMoreHistoryDays(): void {
    if (this.loadingDays()) {
      return;
    }
    if (this.dayWindow() < this.historyDays().length) {
      this.dayWindow.update((w) => w + 10);
      return;
    }
    if (this.daysExhausted || this.oldestDayFetchMs === null) {
      return;
    }
    this.fetchHistoryDays(this.oldestDayFetchMs - 1);
  }

  /** Con pocos días el panel no hace scroll: pide la ventana anterior
      automáticamente hasta llegar a 10 días (o agotar la historia). */
  private maybeAutoFillDays(): void {
    if (this.daysExhausted || this.loadingDays()) {
      return;
    }
    if (this.historyDays().length >= 10) {
      return;
    }
    if (this.autoFillFetches >= StudioComponent.MAX_AUTOFILL_FETCHES) {
      return;
    }
    if (this.oldestDayFetchMs === null) {
      return;
    }
    this.autoFillFetches++;
    this.fetchHistoryDays(this.oldestDayFetchMs - 1);
  }

  /** Consulta la ventana [to - 60d, to] y mezcla los días al catálogo. */
  private fetchHistoryDays(toMs: number): void {
    this.loadingDays.set(true);
    const fromMs = toMs - StudioComponent.HISTORY_WINDOW_MS;
    this.oldestDayFetchMs = fromMs;
    this.agencyService
      .taskHistory({
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        resource_type: 'video',
        limit: StudioComponent.HISTORY_PAGE_LIMIT,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingDays.set(false)),
        catchError(() => {
          this.daysExhausted = true;
          return EMPTY;
        }),
      )
      .subscribe((logs) => {
        // finalize corre recién en complete: bajar el flag acá para que el
        // auto-relleno pueda encadenar la ventana siguiente.
        this.loadingDays.set(false);
        const rows = logs ?? [];
        if (rows.length === 0) {
          this.daysExhausted = true;
          return;
        }
        const counts = new Map<string, number>();
        for (const log of rows) {
          if (!log.task_id || log.task_id === '<no-task>') {
            continue;
          }
          const key = this.dayKey(new Date(log.created_at).getTime());
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        if (counts.size === 0) {
          this.daysExhausted = true;
          return;
        }
        const merged = new Map(this.historyDays().map((d) => [d.key, d.count]));
        for (const [key, count] of counts) {
          merged.set(key, (merged.get(key) ?? 0) + count);
        }
        this.historyDays.set(
          [...merged.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([key, count]) => ({ key, count, label: this.dayLabel(key) })),
        );
        this.maybeAutoFillDays();
      });
  }

  /** Orden "resultados arriba": Listo → en curso → error/cancelado. */
  private static statusRank(status: StudioTake['status']): number {
    return status === 'succeeded' ? 0 : status === 'failed' || status === 'cancelled' ? 2 : 1;
  }

  /**
   * Reel agrupado por día (más reciente arriba); dentro de cada día los
   * resultados van primero y la cola de trabajos en curso después. Con una
   * sesión de historial activa solo se muestra ese día.
   */
  protected readonly reelGroups = computed<{ key: string; label: string; takes: StudioTake[] }[]>(
    () => {
      const project = this.selectedProject();
      const session = this.sessionDate();
      // Con un proyecto seleccionado, el reel muestra TODAS sus generaciones
      // (el trabajo de un proyecto cruza días): el filtro por día cede.
      const visible = this.takes().filter((t) =>
        project
          ? t.request?.event_id === project.id || t.eventName === project.name
          : !session || this.dayKey(t.createdAt) === session,
      );
      const groups = new Map<string, StudioTake[]>();
      for (const take of visible) {
        const key = this.dayKey(take.createdAt);
        const list = groups.get(key);
        if (list) {
          list.push(take);
        } else {
          groups.set(key, [take]);
        }
      }
      return [...groups.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([key, list]) => ({
          key,
          label: this.dayLabel(key),
          takes: list.sort(
            (a, b) =>
              StudioComponent.statusRank(a.status) - StudioComponent.statusRank(b.status) ||
              b.createdAt - a.createdAt,
          ),
        }));
    },
  );

  /** Etiqueta de la sesión activa ("Hoy", "Ayer" o fecha corta). */
  protected readonly sessionLabel = computed(() => {
    const session = this.sessionDate();
    return session ? this.dayLabel(session) : '';
  });

  /** Clave local YYYY-MM-DD de un timestamp. */
  protected dayKey(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Etiqueta del día: Hoy / Ayer / fecha corta local. */
  protected dayLabel(key: string): string {
    if (key === this.dayKey(Date.now())) {
      return 'Hoy';
    }
    if (key === this.dayKey(Date.now() - 24 * 60 * 60 * 1000)) {
      return 'Ayer';
    }
    return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  /** Sale del modo sesión: el reel vuelve a mostrar todos los días. */
  protected clearSession(): void {
    this.eventsStore.clearSession();
  }

  /** Duration popover (slider) anchored to the prompt-foot chip. */
  private readonly durationPopover = viewChild<Popover>('durationPopover');
  private readonly assetPopover = viewChild<Popover>('assetPopover');
  /** Modal de asignación de proyecto (icono junto a Video/Imagen). */
  protected readonly projectDialogVisible = signal(false);
  /** Modal de la biblioteca para elegir referencias ya subidas. */
  protected readonly libraryPickerVisible = signal(false);

  /** Modal "Editar elemento": se abre tras subir una referencia para detallarla. */
  protected readonly editorVisible = signal(false);
  protected readonly editorAsset = signal<FileAsset | null>(null);

  /** Abre la modal de asignación de proyecto. */
  protected projectAlert(): void {
    this.projectDialogVisible.set(true);
  }

  /** Asset del popover de miniatura abierto (null = cerrado). */
  protected readonly previewAsset = signal<FileAsset | null>(null);
  /** Asset mostrado a pantalla completa en el modal. */
  protected readonly fullscreenAsset = signal<FileAsset | null>(null);

  protected toggleDurationPopover(event: Event): void {
    this.durationPopover()?.toggle(event);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.refErrorTimer) {
        clearTimeout(this.refErrorTimer);
      }
    });
    // Keep the chosen duration inside the selected model's supported range
    // (e.g. switching from Seedance 2.5 [60s max] to Wan [10s max]).
    effect(() => {
      const { min, max } = this.durationRange();
      const current = this.duration();
      if (current < min) {
        this.duration.set(min);
      } else if (current > max) {
        this.duration.set(max);
      }
    });
    // Keep resolution/ratio valid when switching models (e.g. MiniMax H3
    // only offers 2K; Seedance i2v follows the image and hides ratios).
    effect(() => {
      const resolutions = this.resolutionOptions();
      if (!resolutions.includes(this.resolution())) {
        this.resolution.set(resolutions[0]);
      }
      const allowed = this.allowedRatios();
      if (allowed && !allowed.has(this.ratio())) {
        const fallback = this.visibleRatioOptions()[0];
        if (fallback) {
          this.ratio.set(fallback.value);
        }
      }
    });
    // Reuse pedido desde /projects: se aplica cuando el catálogo de modelos
    // esté disponible (el request viaja por sessionStorage).
    if (isPlatformBrowser(this.platformId)) {
      const raw = sessionStorage.getItem('studio:reuse');
      if (raw) {
        sessionStorage.removeItem('studio:reuse');
        try {
          const req = JSON.parse(raw) as GenerateRequest;
          const prompt = (req.content ?? []).find((c) => c.type === 'text')?.text ?? '';
          this.pendingReuse.set({ req, prompt });
        } catch {
          // Payload inválido: se ignora.
        }
      }
    }
    effect(() => {
      const pending = this.pendingReuse();
      // Espera el catálogo Y la lista de proyectos: así el proyecto de la
      // generación original (Agencia) se selecciona y su take reel carga.
      if (!pending || !this.models().length || this.loadingProjects()) {
        return;
      }
      this.pendingReuse.set(null);
      this.applyReuseRequest(pending.req, pending.prompt);
    });
    this.loadModels();
    this.loadProjects();
    this.loadAssets();
    this.loadIngredients();
    this.restoreCols();
  }

  // ─── Columnas redimensionables (gutters entre columnas) ──────────
  protected onGutterDown(event: PointerEvent, side: 'left' | 'right'): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    const gutter = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startW = side === 'left' ? this.colLeft() : this.colRight();
    try {
      gutter.setPointerCapture(event.pointerId);
    } catch {
      // Sin captura (jsdom/tests): igual se trackea con listeners.
    }
    const onMove = (move: PointerEvent): void => {
      const delta = move.clientX - startX;
      const next = StudioComponent.clampCol(
        side === 'left' ? startW + delta : startW - delta,
        side === 'right' ? this.colRightMax() : StudioComponent.COL_MAX,
      );
      if (side === 'left') {
        this.colLeft.set(next);
      } else {
        this.colRight.set(next);
      }
    };
    const onUp = (): void => {
      gutter.removeEventListener('pointermove', onMove);
      gutter.removeEventListener('pointerup', onUp);
      gutter.removeEventListener('pointercancel', onUp);
      this.persistCols();
    };
    gutter.addEventListener('pointermove', onMove);
    gutter.addEventListener('pointerup', onUp);
    gutter.addEventListener('pointercancel', onUp);
    event.preventDefault();
  }

  protected onGutterKey(event: KeyboardEvent, side: 'left' | 'right'): void {
    const step = event.shiftKey ? 48 : 12;
    const signal = side === 'left' ? this.colLeft : this.colRight;
    if (event.key === 'ArrowLeft') {
      signal.set(StudioComponent.clampCol(signal() - step, this.colMaxFor(side)));
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      signal.set(StudioComponent.clampCol(signal() + step, this.colMaxFor(side)));
      event.preventDefault();
    } else if (event.key === 'Home' && side === 'left') {
      this.resetCols();
      event.preventDefault();
    } else {
      return;
    }
    this.persistCols();
  }

  protected resetCols(): void {
    this.colLeft.set(340);
    this.colRight.set(320);
    this.persistCols();
  }

  private static clampCol(width: number, max = StudioComponent.COL_MAX): number {
    return Math.min(max, Math.max(StudioComponent.COL_MIN, Math.round(width)));
  }

  /** Tope dinámico del Take Reel: nunca más de la mitad de la pantalla. */
  private colRightMax(): number {
    const half = Math.floor(window.innerWidth / 2);
    return Math.max(StudioComponent.COL_MIN, Math.min(StudioComponent.COL_MAX, half));
  }

  private colMaxFor(side: 'left' | 'right'): number {
    return side === 'right' ? this.colRightMax() : StudioComponent.COL_MAX;
  }

  /** Re-clampa la columna derecha si la ventana se achica. */
  protected onWinResize(): void {
    this.colRight.set(StudioComponent.clampCol(this.colRight(), this.colRightMax()));
  }

  private restoreCols(): void {
    const saved = this.readCols();
    if (saved) {
      this.colLeft.set(StudioComponent.clampCol(saved.left));
      this.colRight.set(StudioComponent.clampCol(saved.right, this.colRightMax()));
    }
  }

  private persistCols(): void {
    try {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      localStorage.setItem(
        StudioComponent.COLS_KEY,
        JSON.stringify({ left: this.colLeft(), right: this.colRight() }),
      );
    } catch {
      // Almacenamiento no disponible: los anchos viven solo en la sesión.
    }
  }

  private readCols(): { left: number; right: number } | null {
    try {
      if (!isPlatformBrowser(this.platformId)) {
        return null;
      }
      const raw = localStorage.getItem(StudioComponent.COLS_KEY);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { left?: unknown }).left === 'number' &&
        typeof (parsed as { right?: unknown }).right === 'number'
      ) {
        const cols = parsed as { left: number; right: number };
        if (Number.isFinite(cols.left) && Number.isFinite(cols.right)) {
          return cols;
        }
      }
    } catch {
      // JSON corrupto o sin acceso: se usan los anchos por defecto.
    }
    return null;
  }

  // ─── Loaders ───────────────────────────────────────────────────
  private loadModels(): void {
    this.loadingModels.set(true);
    this.studioService
      .listModels()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los modelos. ¿Está el backend corriendo?');
          return EMPTY;
        }),
        finalize(() => this.loadingModels.set(false)),
      )
      .subscribe((models) => {
        this.models.set(models);
        // Preselect the lightest downloaded video model for instant play.
        const preferred = models.find(
          (m) =>
            m.modality === 'video' &&
            m.type === 'downloaded' &&
            m.available &&
            m.name.includes('1.3B'),
        );
        if (preferred) {
          this.selectedModel.set(preferred);
        }
      });
  }

  private loadProjects(): void {
    this.loadingProjects.set(true);
    this.eventsService
      .listEvents()
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los proyectos.');
          return EMPTY;
        }),
        finalize(() => this.loadingProjects.set(false)),
      )
      .subscribe((projects) => this.projects.set(projects));
  }

  /** Cambio de proyecto: los recursos se filtran a los asignados a ese
      proyecto y el historial por día cede prioridad (se limpia la sesión). */
  protected onProjectChange(projectId: string | null): void {
    this.selectedProjectId.set(projectId);
    this.selectedAssetIds.set(new Set());
    this.refSlots.update((slots) => ({ ...slots, character: null, location: null, props: null }));
    this.eventsStore.clearSession();
    if (projectId) {
      // Take reel del proyecto: sus generaciones de video entran al historial
      // del studio (las hechas en la Agencia incluidas).
      this.eventsStore.hydrateProject(projectId);
    }
    this.loadAssets();
  }

  /** Quita la asignación de proyecto (vuelve a la biblioteca global + auto Studio). */
  protected clearProject(): void {
    this.onProjectChange(null);
    this.projectDialogVisible.set(false);
  }

  /** Crea un proyecto desde la modal y lo selecciona al instante. */
  protected createProjectQuick(): void {
    const name = this.newProjectName().trim();
    if (!name || this.creatingProject()) {
      return;
    }
    this.creatingProject.set(true);
    this.eventsService
      .createEvent({ name })
      .pipe(
        catchError(() => {
          this.error.set('No se pudo crear el proyecto.');
          return EMPTY;
        }),
        finalize(() => this.creatingProject.set(false)),
      )
      .subscribe((event) => {
        if (!event) {
          return;
        }
        this.projects.update((list) => [...list, event]);
        this.newProjectName.set('');
        // Elegirlo equivalente: filtra recursos y limpia la sesión del día.
        this.onProjectChange(event.id);
      });
  }

  private loadAssets(): void {
    this.loadingAssets.set(true);
    const eventId = this.selectedProjectId() ?? undefined;
    this.libraryService
      .listFilesPaginated({ page: 1, pageSize: 200, event_id: eventId })
      .pipe(
        catchError(() => EMPTY),
        finalize(() => this.loadingAssets.set(false)),
      )
      .subscribe((pageData) => {
        const files = [...(pageData.items ?? [])] as FileAsset[];
        this.assets.set(files);
        this.autoAssignRefs(files);
        // Con la lista definitiva de recursos, re-resolver los @ del prompt
        // (p.ej. un REUSAR que cambió de proyecto antes de que llegaran).
        this.syncMentionsFromText();
        this.syncSelectionWithMentions();
      });
  }

  /**
   * Al elegir un proyecto que ya tiene imágenes asignadas, éstas se cargan
   * como referencias: llenan los slots tipados y quedan seleccionadas para
   * la generación (hasta maxSelectedRefs).
   */
  private autoAssignRefs(files: FileAsset[]): void {
    if (!this.selectedProjectId()) {
      return;
    }
    const images = files.filter((f) => (f.mime_type ?? '').startsWith('image/'));
    if (images.length === 0) {
      return;
    }
    const slots = { ...this.refSlots() };
    (['character', 'location', 'props'] as RefSlotDef['key'][]).forEach((key, i) => {
      if (images[i]) {
        slots[key] = images[i].id;
      }
    });
    this.refSlots.set(slots);
    this.selectedAssetIds.set(new Set(images.slice(0, this.maxSelectedRefs).map((f) => f.id)));
  }

  // ─── Mode & model ──────────────────────────────────────────────
  protected setMode(mode: 'video' | 'image'): void {
    this.mode.set(mode);
    const current = this.selectedModel();
    if (current && current.modality !== mode) {
      this.selectedModel.set(this.modeModels()[0] ?? null);
    }
  }

  protected onModelChange(name: string | null): void {
    const model = this.models().find((m) => m.name === name) ?? null;
    this.selectedModel.set(model);
  }

  protected toggleRatio(value: string): void {
    this.ratio.set(value);
  }

  /** Cambio de ratio: ignora valores no soportados por el modelo elegido. */
  protected onRatioChange(value: string | null): void {
    if (!value) {
      return;
    }
    const allowed = this.allowedRatios();
    if (allowed && !allowed.has(value)) {
      return;
    }
    this.ratio.set(value);
  }

  // ─── Assets ────────────────────────────────────────────────────
  /** Desvincula un slot (no borra el asset de la biblioteca). */
  protected clearSlot(slot: RefSlotDef['key']): void {
    this.refSlots.update((slots) => ({ ...slots, [slot]: null }));
  }

  /** Quita la miniatura de la lista local (sin borrar el asset en el backend). */
  protected removeAsset(assetId: string): void {
    this.assets.update((list) => list.filter((a) => a.id !== assetId));
    const next = new Set(this.selectedAssetIds());
    if (next.delete(assetId)) {
      this.selectedAssetIds.set(next);
    }
    this.refSlots.update((slots) => {
      let changed = false;
      const out = { ...slots };
      for (const key of Object.keys(out) as RefSlotDef['key'][]) {
        if (out[key] === assetId) {
          out[key] = null;
          changed = true;
        }
      }
      return changed ? out : slots;
    });
    if (this.previewAsset()?.id === assetId) {
      this.previewAsset.set(null);
      this.assetPopover()?.hide();
    }
  }

  /** Abre el popover de vista previa de una miniatura. */
  protected openPreview(asset: FileAsset, event: Event): void {
    this.previewAsset.set(asset);
    this.assetPopover()?.toggle(event);
  }

  protected closePreview(): void {
    this.previewAsset.set(null);
    this.assetPopover()?.hide();
  }

  /** Abre la imagen a pantalla completa desde el popover. */
  protected openFullscreen(asset: FileAsset): void {
    this.fullscreenAsset.set(asset);
    this.closePreview();
  }

  protected closeFullscreen(): void {
    this.fullscreenAsset.set(null);
  }

  /** Nombre corto del archivo para el popover. */
  protected shortName(name: string): string {
    return name.length > 28 ? name.slice(0, 26) + '…' : name;
  }

  protected toggleAsset(id: string): void {
    const next = new Set(this.selectedAssetIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= this.maxSelectedRefs) {
        this.flashRefError(
          `Podés seleccionar hasta ${this.maxSelectedRefs} referencias por generación.`,
        );
        return;
      }
      next.add(id);
    }
    this.selectedAssetIds.set(next);
  }

  /**
   * Recursos elegidos en la modal de biblioteca: se incorporan a la lista
   * local, quedan seleccionados como referencias y llenan los slots vacíos.
   */
  protected onLibraryPicked(picked: FileAsset[]): void {
    if (picked.length === 0) {
      return;
    }
    this.assets.update((list) => {
      const known = new Set(list.map((a) => a.id));
      return [...list, ...picked.filter((p) => !known.has(p.id))];
    });
    const next = new Set(this.selectedAssetIds());
    for (const p of picked) {
      if (next.size >= this.maxSelectedRefs) {
        break;
      }
      next.add(p.id);
    }
    this.selectedAssetIds.set(next);
    const slots = { ...this.refSlots() };
    let remaining = [...picked];
    (['character', 'location', 'props'] as RefSlotDef['key'][]).forEach((key) => {
      if (slots[key]) {
        return;
      }
      const idx = remaining.findIndex((p) => (p.mime_type ?? '').startsWith('image/'));
      if (idx >= 0) {
        slots[key] = remaining[idx].id;
        remaining = remaining.filter((_, i) => i !== idx);
      }
    });
    this.refSlots.set(slots);
  }

  /** Refleja el asset guardado en la grilla local (nombre/chip al instante). */
  protected onEditorSaved(saved: FileAsset): void {
    this.assets.update((list) => list.map((item) => (item.id === saved.id ? saved : item)));
    this.editorAsset.set(saved);
  }

  /** Tras un cambio de fondo en el editor, refresca el asset abierto. */
  protected onEditorChanged(): void {
    const asset = this.editorAsset();
    if (!asset) {
      return;
    }
    this.libraryService
      .getFile(asset.id)
      .pipe(catchError(() => EMPTY))
      .subscribe((fresh) => {
        if (fresh) {
          this.assets.update((list) =>
            list.map((item) => (item.id === fresh.id ? fresh : item)),
          );
          this.editorAsset.set(fresh);
        } else {
          this.removeAsset(asset.id);
          this.editorVisible.set(false);
          this.editorAsset.set(null);
        }
      });
  }

  /** Muestra el aviso de límite solo en el momento de la violación; se auto-oculta. */
  private flashRefError(message: string): void {
    this.refError.set(message);
    if (this.refErrorTimer) {
      clearTimeout(this.refErrorTimer);
    }
    this.refErrorTimer = setTimeout(() => this.refError.set(null), 5000);
  }

  private clearRefError(): void {
    if (this.refErrorTimer) {
      clearTimeout(this.refErrorTimer);
      this.refErrorTimer = null;
    }
    this.refError.set(null);
  }

  /**
   * Upload a picked image into a typed reference slot (character/location/
   * props). On success the asset is prepended to the gallery (thumbnail
   * listed immediately) and bound to its slot.
   */
  protected onSlotPicked(event: Event, slot: RefSlotDef['key']): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      this.flashRefError(`"${file.name}" no es una imagen PNG o JPEG.`);
      input.value = '';
      return;
    }
    if (file.size > this.maxRefBytes) {
      this.flashRefError(`"${file.name}" supera el máximo de ${this.maxRefLabel} por referencia.`);
      input.value = '';
      return;
    }
    this.clearRefError();
    this.uploadingSlot.set(slot);
    // La referencia se guarda en su sección de galería (files.category):
    // character / location / props, igual que los slots tipados.
    this.libraryService
      .uploadFile(file, slot, this.selectedProjectId() ?? undefined)
      .pipe(
        catchError(() => {
          this.flashRefError(`No se pudo subir "${file.name}". Intentá de nuevo.`);
          return EMPTY;
        }),
        finalize(() => {
          this.uploadingSlot.set(null);
          input.value = '';
        }),
      )
      .subscribe((asset) => {
        this.assets.update((list) => [asset, ...list]);
        this.refSlots.update((slots) => ({ ...slots, [slot]: asset.id }));
        if (!this.selectedAssetIds().has(asset.id)) {
          this.toggleAsset(asset.id);
        }
        // Abrir el editor para nombrar y detallar la referencia recién subida.
        this.editorAsset.set(asset);
        this.editorVisible.set(true);
      });
  }

  /** Library URL for a slot thumbnail; falls back to a placeholder frame. */
  protected assetThumbUrl(assetId: string): string {
    const asset = this.assets().find((a) => a.id === assetId);
    return this.resolveThumbUrl(asset?.thumbnail_url || asset?.url);
  }

  /** Resuelve una ruta relativa de thumb/url a URL absoluta del back. */
  private resolveThumbUrl(url?: string | null): string {
    if (!url) {
      return '';
    }
    const origin = environment.API_URL.replace(/\/api\/v1\/?$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return /^https?:\/\//i.test(url) ? url : `${origin}${path}`;
  }

  /** Miniatura del primer recurso del ingrediente (menú/chip @); '' si no tiene. */
  protected ingredientThumbUrl(ing: IngredientWithFiles): string {
    const first = this.assetsOfIngredient(ing)[0];
    return this.resolveThumbUrl(first?.thumbnail_url || first?.url);
  }

  /** Oculta miniaturas rotas (el thumb conserva fondo + tooltip del nombre). */
  protected onThumbError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    img?.style.setProperty('display', 'none');
  }

  // ─── Generate ──────────────────────────────────────────────────
  protected canGenerate(): boolean {
    return !!this.selectedModel() && this.prompt().trim().length > 0 && !this.submitting();
  }

  protected generate(): void {
    const model = this.selectedModel();
    const rawText = this.prompt().trim();
    if (!model || !rawText || this.submitting()) {
      return;
    }
    this.error.set(null);
    this.submitting.set(true);

    // Menciones @ válidas → content items image; el texto se envía limpio
    // (sin tokens @) porque el backend compila el prompt del texto puro.
    // Los ingredientes citados expanden a TODOS sus recursos.
    this.syncMentionsFromText();
    const mentions = [...this.mentionedAssets()];
    for (const ing of this.mentionedIngredients()) {
      for (const asset of this.assetsOfIngredient(ing)) {
        if (!mentions.some((a) => a.id === asset.id)) {
          mentions.push(asset);
        }
      }
    }
    const text = mentions.length
      ? this.stripMentions(rawText)
          .replace(/\s{2,}/g, ' ')
          .trim()
      : rawText;

    const ratio = this.ratio();
    const duration = this.mode() === 'video' ? this.duration() : 0;
    const payload: GenerateRequest = {
      model: model.name,
      content: [
        ...mentions.map((a) => ({ type: 'image' as const, id: a.id, name: a.filename })),
        { type: 'text' as const, text },
      ],
      ratio,
      duration: duration || undefined,
      resolution: this.resolution(),
      // El seed solo aplica a modelos del inference worker.
      seed: this.workerModel() ? this.seed().trim() || undefined : undefined,
      // ensureTakeSlot resuelve proyecto/pieza (auto "Studio" si no hay uno).
      event_id: this.selectedProjectId() ?? '',
      program_id: undefined,
      piece_id: '',
      piece_code: this.takeCode(),
      generation_number: 0,
    };
    this.launchGeneration(payload, {
      prompt: rawText,
      modelName: model.name,
      modelDisplayName: model.displayName,
      modelType: model.type,
      ratio,
      resolution: this.resolution(),
      duration,
      eventName: this.selectedProject()?.name ?? null,
      refImages: mentions.map((a) => ({ id: a.id, name: a.filename })),
    });
  }

  /**
   * Lanza una generación (nueva o re-generada): crea la toma pendiente en el
   * reel, resuelve proyecto/pieza y envía el request. `display` alimenta la
   * tarjeta mientras viaja; el request queda guardado para poder re-generar.
   */
  private launchGeneration(
    payload: GenerateRequest,
    display: {
      prompt: string;
      modelName: string;
      modelDisplayName: string;
      modelType: StudioModelType;
      ratio: string;
      resolution: string;
      duration: number;
      eventName: string | null;
      refImages: { id: string; name: string }[];
    },
  ): void {
    const takeId = `pending_${Date.now()}`;
    const take: StudioTake = {
      id: takeId,
      prompt: display.prompt,
      modelName: display.modelName,
      modelDisplayName: display.modelDisplayName,
      modelType: display.modelType,
      ratio: display.ratio,
      resolution: display.resolution,
      duration: display.duration,
      status: 'queued',
      progress: 0,
      videoUrl: null,
      error: null,
      createdAt: Date.now(),
      ratingGood: false,
      ratingFinal: false,
      eventName: display.eventName,
      refImages: display.refImages,
      request: payload,
    };
    this.eventsStore.upsert(take);
    this.selectedTakeId.set(takeId);

    // Centralización: la generación se liga al proyecto del request (o al
    // auto "Studio" cuando no tiene). Reutilizable al regenerar tomas.
    this.studioService
      .ensureTakeSlot(
        `Studio ${new Date().toLocaleDateString()}`,
        payload.piece_code,
        payload.event_id || undefined,
      )
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto Studio.');
          this.submitting.set(false);
          // Nada se creó en el server: se descarta la take pendiente
          // (en rehacer, la toma original queda intacta para reintentar).
          this.eventsStore.remove(takeId);
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        const finalPayload: GenerateRequest = {
          ...payload,
          event_id: project.id,
          piece_id: piece.id,
          piece_code: piece.piece_code ?? piece.id,
          generation_number: ++this.takeCounter,
        };
        const modality =
          (this.models().find((m) => m.name === payload.model)?.modality as Modality) ??
          this.mode();
        this.agencyService
          .generate(modality, finalPayload)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo iniciar la generación.');
              this.submitting.set(false);
              // Nada se creó en el server: se descarta la take pendiente
              // (en rehacer, la toma original queda intacta para reintentar).
              this.eventsStore.remove(takeId);
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.eventsStore.patch(takeId, {
              id: response.taskId,
              costCredits: response.cost_credits ?? 0,
              costUsd: response.cost_usd ?? 0,
              transactionId: response.provider_transaction_id || null,
            });
            this.eventsStore.track(response.taskId);
            this.selectedTakeId.set(response.taskId);
            this.submitting.set(false);
          });
      });
  }

  // ─── Take list helpers ─────────────────────────────────────────
  protected selectTake(take: StudioTake): void {
    this.selectedTakeId.set(take.id);
  }

  /** Abre el modal de detalle (y deja la toma seleccionada en el visor). */
  protected openTakeDetail(take: StudioTake): void {
    this.selectedTakeId.set(take.id);
    this.takeDetailId.set(take.id);
    this.takeDetailVisible.set(true);
  }

  /** Cierra el modal de detalle. */
  protected closeTakeDetail(): void {
    this.takeDetailVisible.set(false);
    this.takeDetailId.set(null);
  }

  /** Aspect-ratio de la toma para el media del modal (fallback 16:9). */
  protected takeAr(take: StudioTake): string {
    const m = /^([\d.]+)\s*:\s*([\d.]+)$/.exec(take.ratio ?? '');
    if (!m) return '1.7778';
    const w = Number(m[1]);
    const h = Number(m[2]);
    return w > 0 && h > 0 ? (w / h).toFixed(4) : '1.7778';
  }

  /** Etiqueta de gasto del modal: "$0.094 · 1.5 cr" o "—". */
  protected takeCostLabel(take: StudioTake): string {
    const parts: string[] = [];
    if ((take.costUsd ?? 0) > 0) parts.push(this.formatCostUsd(take.costUsd!));
    if ((take.costCredits ?? 0) > 0) parts.push(this.formatCredits(take.costCredits!));
    return parts.join(' · ') || '—';
  }

  /** Formato de la toma: "16:9 · 720p · 5s" o "—". */
  protected takeFormatLabel(take: StudioTake): string {
    const parts = [take.ratio ?? '', take.resolution ?? '', take.duration ? `${take.duration}s` : ''];
    return parts.filter((p) => p !== '').join(' · ') || '—';
  }

  protected cancelTake(take: StudioTake): void {
    this.eventsStore.cancel(take.id);
  }

  /** Alterna el check "Buena toma" (persistente por video): excluye
      "Elegida final", solo puede haber una calificación o ninguna. */
  protected toggleGood(take: StudioTake): void {
    this.eventsStore.setRating(take.id, !take.ratingGood, false);
  }

  /** Alterna el check "Elegida final" (persistente por video): excluye
      "Buena toma", solo puede haber una calificación o ninguna. */
  protected toggleFinal(take: StudioTake): void {
    this.eventsStore.setRating(take.id, false, !take.ratingFinal);
  }

  /** Limpia ambas calificaciones del video (CLEAR). */
  protected clearRating(take: StudioTake): void {
    if (!take.ratingGood && !take.ratingFinal) {
      return;
    }
    this.eventsStore.setRating(take.id, false, false);
  }

  // ─── Gasto del proveedor (logs de la app) ───────────────────

  /** Hay gasto registrado para la toma (créditos o USD). */
  protected hasCost(take: StudioTake): boolean {
    return (take.costUsd ?? 0) > 0 || (take.costCredits ?? 0) > 0;
  }

  /** USD compacto (0.094 → "$0.094", 1.5 → "$1.50"). */
  protected formatCostUsd(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    const text = rounded.toFixed(rounded >= 1 ? 2 : 3).replace(/\.?0+$/, '');
    return `$${text}`;
  }

  /** Créditos del proveedor (1.5 → "1.5 cr"). */
  protected formatCredits(value: number): string {
    return `${Math.round(value * 100) / 100} cr`;
  }

  /** Tooltip explicativo del gasto: qué significa "cr", el equivalente USD
      y la política de reembolso del proveedor. */
  protected costTooltip(take: StudioTake): string {
    const bits: string[] = [];
    if ((take.costCredits ?? 0) > 0) {
      bits.push(`${this.formatCredits(take.costCredits!)} = créditos del proveedor (Higgsfield)`);
    }
    if ((take.costUsd ?? 0) > 0) {
      bits.push(`${this.formatCostUsd(take.costUsd!)} = equivalente en dólares (USD)`);
    }
    let text = `Gasto estimado por Higgsfield: ${bits.join(', ')}. Las generaciones fallidas o canceladas se reembolsan.`;
    if (take.transactionId) {
      text += ` Transaction ID: ${take.transactionId}`;
    }
    return text;
  }

  /** Reuso pendiente desde /projects (request guardado en sessionStorage). */
  private readonly pendingReuse = signal<{ req: GenerateRequest; prompt: string } | null>(null);

  /** Reusar: carga el request original de la toma en el studio (prompt,
      modelo, formato, seed y proyecto) sin generar nada, para que el
      usuario ajuste lo que necesite y lance la generación manualmente. */
  protected reuse(take: StudioTake): void {
    if (!take.request || this.submitting()) {
      return;
    }
    this.takeDetailId.set(null);
    this.takeDetailVisible.set(false);
    this.error.set(null);
    this.applyReuseRequest(take.request, take.prompt);
  }

  /** Aplica un request guardado al formulario del studio (sin generar). */
  private applyReuseRequest(req: GenerateRequest, prompt: string): void {
    this.setMode('video');
    this.prompt.set(prompt);
    this.ratio.set(req.ratio || '16:9');
    this.resolution.set(req.resolution || '720p');
    this.duration.set(req.duration || 5);
    this.seed.set(req.seed ?? '');
    const model = this.models().find((m) => m.name === req.model);
    if (model) {
      this.selectedModel.set(model);
    }
    // Proyecto de la generación original (si tuvo uno y sigue existiendo):
    // onProjectChange recarga SUS recursos (slots + selección) y limpia la
    // sesión de día.
    const eventId = req.event_id || '';
    if (eventId && this.projects().some((p) => p.id === eventId)) {
      this.onProjectChange(eventId);
    }
    // Los @ del prompt restauran los recursos citados: menciones, selección
    // y slots (al llegar los assets del proyecto se re-resuelven solos).
    this.syncMentionsFromText();
    this.syncSelectionWithMentions();
    setTimeout(() => this.promptTextarea?.focus());
  }

  /** Miniatura pública de una imagen de referencia (asset ya cargado). */
  protected refThumbUrl(refId: string): string {
    const asset = this.assets().find((a) => a.id === refId);
    return asset?.thumbnail_url || asset?.url || '';
  }

  private takeCode(): string {
    const stamp = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `STU-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
  }

  protected takeStatusSeverity(
    status: StudioTake['status'],
  ): 'success' | 'danger' | 'info' | 'warn' | 'secondary' {
    switch (status) {
      case 'succeeded':
        return 'success';
      case 'failed':
        return 'danger';
      case 'running':
        return 'info';
      case 'cancelled':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  protected takeStatusLabel(status: StudioTake['status']): string {
    const labels: Record<StudioTake['status'], string> = {
      queued: 'En cola',
      running: 'Generando',
      succeeded: 'Listo',
      failed: 'Error',
      cancelled: 'Cancelado',
    };
    return labels[status];
  }

  protected formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Atajos de teclado UI-only: solo invocan métodos/sets existentes.
   * - Ctrl/Cmd+Enter: generar si se puede.
   * - `/` fuera de campos editables: foco al prompt.
   * - Escape: cierra lo abierto por prioridad (menciones, popovers, fullscreen, diálogos).
   */
  protected onShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (this.canGenerate()) {
        this.generate();
      }
      return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === 'function' &&
        target.closest('input, textarea, select, [contenteditable]')
      ) {
        return;
      }
      event.preventDefault();
      this.promptTextarea?.focus();
      return;
    }
    if (event.key === 'Escape') {
      if (this.dayMenuOpen()) {
        this.dayMenuOpen.set(false);
        return;
      }
      if (this.mentionMenuOpen()) {
        this.closeMentionMenu();
        return;
      }
      const duration = this.durationPopover();
      if (duration?.overlayVisible) {
        duration.hide();
        return;
      }
      const asset = this.assetPopover();
      if (asset?.overlayVisible) {
        asset.hide();
        return;
      }
      if (this.fullscreenAsset()) {
        this.closeFullscreen();
        return;
      }
      if (this.projectDialogVisible()) {
        this.projectDialogVisible.set(false);
        return;
      }
      if (this.libraryPickerVisible()) {
        this.libraryPickerVisible.set(false);
      }
    }
  }
}
