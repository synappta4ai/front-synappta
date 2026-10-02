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
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Popover } from 'primeng/popover';
import { Select } from 'primeng/select';
import { PrimeTemplate } from 'primeng/api';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Message } from 'primeng/message';

import { AgencyService } from '@modules/agency/services';
import { LibraryService } from '@modules/library/services';
import { FileAsset, Ingredient, IngredientWithFiles } from '@modules/library/interfaces';
import { EventsService } from '@modules/events/services';
import { Event as Project } from '@modules/events/interfaces';
import { ServerUrlPipe } from '@core/pipes/server-url.pipe';
import { GenerationEventsStore } from '@core/store/generation.events';
import { environment } from '@env/environment';

import { StudioService } from '../../services/studio.service';
import { StudioModel, StudioTake } from '../../interfaces';
import { AssetPickerDialogComponent } from '@shared/components/index';
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

@Component({
  selector: 'app-studio',
  imports: [
    FormsModule,
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
    SlidePillDirective,
    TiltDirective,
    ImgFadeDirective,
  ],
  templateUrl: './studio.component.html',
  styleUrl: './studio.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class StudioComponent {
  private readonly studioService = inject(StudioService);
  private readonly agencyService = inject(AgencyService);
  private readonly libraryService = inject(LibraryService);
  private readonly eventsService = inject(EventsService);
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

  /** Filas del menú @: recursos (imágenes) + ingredientes, filtradas por query. */
  protected readonly mentionRows = computed<
    {
      kind: 'asset' | 'ingredient';
      asset?: FileAsset;
      ingredient?: Ingredient;
      wrapper?: IngredientWithFiles;
      label: string;
    }[]
  >(() => {
    const query = this.mentionQuery().trim().toLowerCase();
    const mentionedAssets = new Set(this.mentionedAssets().map((a) => a.id));
    const mentionedIngs = new Set(this.mentionedIngredients().map((i) => i.ingredient.name));
    const matches = (label: string) => !query || label.toLowerCase().includes(query);

    const rows: {
      kind: 'asset' | 'ingredient';
      asset?: FileAsset;
      ingredient?: Ingredient;
      wrapper?: IngredientWithFiles;
      label: string;
    }[] = [];
    for (const a of this.assets()) {
      if (
        (a.mime_type ?? '').startsWith('image/') &&
        !mentionedAssets.has(a.id) &&
        matches(a.filename)
      ) {
        rows.push({ kind: 'asset', asset: a, label: a.filename });
      }
    }
    for (const ing of this.ingredients()) {
      if (!mentionedIngs.has(ing.ingredient.name) && matches(ing.ingredient.name)) {
        rows.push({
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
    for (const a of this.assets()) {
      map.set(a.filename, { kind: 'asset', asset: a });
    }
    for (const ing of this.ingredients()) {
      if (!map.has(ing.ingredient.name)) {
        map.set(ing.ingredient.name, { kind: 'ingredient', ing });
      }
    }
    return map;
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
  protected pickMention(row: {
    kind: 'asset' | 'ingredient';
    asset?: FileAsset;
    ingredient?: Ingredient;
    wrapper?: IngredientWithFiles;
  }): void {
    const range = this.mentionRange;
    const textarea = this.promptTextarea;
    if (!range || !textarea) {
      return;
    }
    const label = row.kind === 'asset' ? row.asset!.filename : row.ingredient!.name;
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
    const label = isAsset ? target.filename : target.ingredient.name;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escaped}\\s?`, 'g');
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

  // ─── Takes (global generation-events store) ───────────────────
  protected readonly eventsStore = inject(GenerationEventsStore);
  protected readonly takes = this.eventsStore.events;
  protected readonly selectedTakeId = signal<string | null>(null);
  protected readonly selectedTake = computed(
    () => this.takes().find((t) => t.id === this.selectedTakeId()) ?? null,
  );
  protected readonly activeTakes = this.eventsStore.active;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private takeCounter = 0;

  /** Duration popover (slider) anchored to the prompt-foot chip. */
  private readonly durationPopover = viewChild<Popover>('durationPopover');
  private readonly assetPopover = viewChild<Popover>('assetPopover');
  /** Modal de asignación de proyecto (icono junto a Video/Imagen). */
  protected readonly projectDialogVisible = signal(false);
  /** Modal de la biblioteca para elegir referencias ya subidas. */
  protected readonly libraryPickerVisible = signal(false);

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
      const next = StudioComponent.clampCol(side === 'left' ? startW + delta : startW - delta);
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
      signal.set(StudioComponent.clampCol(signal() - step));
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      signal.set(StudioComponent.clampCol(signal() + step));
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

  private static clampCol(width: number): number {
    return Math.min(StudioComponent.COL_MAX, Math.max(StudioComponent.COL_MIN, Math.round(width)));
  }

  private restoreCols(): void {
    const saved = this.readCols();
    if (saved) {
      this.colLeft.set(StudioComponent.clampCol(saved.left));
      this.colRight.set(StudioComponent.clampCol(saved.right));
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

  /** Cambio de proyecto: los recursos se filtran a los asignados a ese proyecto. */
  protected onProjectChange(projectId: string | null): void {
    this.selectedProjectId.set(projectId);
    this.selectedAssetIds.set(new Set());
    this.refSlots.update((slots) => ({ ...slots, character: null, location: null, props: null }));
    this.loadAssets();
  }

  /** Quita la asignación de proyecto (vuelve a la biblioteca global + auto Studio). */
  protected clearProject(): void {
    this.onProjectChange(null);
    this.projectDialogVisible.set(false);
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
    this.libraryService
      .uploadFile(file, 'images', this.selectedProjectId() ?? undefined)
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
      });
  }

  /** Library URL for a slot thumbnail; falls back to a placeholder frame. */
  protected assetThumbUrl(assetId: string): string {
    const asset = this.assets().find((a) => a.id === assetId);
    const url = asset?.thumbnail_url || asset?.url;
    if (!url) {
      return '';
    }
    const origin = environment.API_URL.replace(/\/api\/v1\/?$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return /^https?:\/\//i.test(url) ? url : `${origin}${path}`;
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
    const takeId = `pending_${Date.now()}`;
    const take: StudioTake = {
      id: takeId,
      prompt: rawText,
      modelName: model.name,
      modelDisplayName: model.displayName,
      modelType: model.type,
      ratio,
      resolution: this.resolution(),
      duration,
      status: 'queued',
      progress: 0,
      videoUrl: null,
      error: null,
      createdAt: Date.now(),
    };
    this.eventsStore.upsert(take);
    this.selectedTakeId.set(takeId);

    // Centralización: la generación se liga al proyecto elegido (o al auto "Studio").
    this.studioService
      .ensureTakeSlot(
        `Studio ${new Date().toLocaleDateString()}`,
        this.takeCode(),
        this.selectedProjectId() ?? undefined,
      )
      .pipe(
        catchError(() => {
          this.error.set('No se pudo preparar el proyecto Studio.');
          this.submitting.set(false);
          this.eventsStore.patch(takeId, { status: 'failed', error: 'no slot' });
          return EMPTY;
        }),
      )
      .subscribe(({ project, piece }) => {
        // Menciones @ → items image (el core resuelve IDs a URLs públicas
        // o asset:// si el recurso está sincronizado con la galería).
        const mentionItems = mentions.map((a) => ({
          type: 'image' as const,
          id: a.id,
          name: a.filename,
        }));
        const payload = {
          model: model.name,
          content: [...mentionItems, { type: 'text' as const, text }],
          ratio,
          duration: duration || undefined,
          resolution: this.resolution(),
          seed: this.seed().trim() || undefined,
          event_id: project.id,
          program_id: undefined,
          piece_id: piece.id,
          piece_code: piece.piece_code ?? piece.id,
          generation_number: ++this.takeCounter,
        };
        this.agencyService
          .generate(this.mode(), payload)
          .pipe(
            catchError(() => {
              this.error.set('No se pudo iniciar la generación.');
              this.submitting.set(false);
              this.eventsStore.patch(takeId, { status: 'failed', error: 'submit error' });
              return EMPTY;
            }),
          )
          .subscribe((response) => {
            this.eventsStore.patch(takeId, { id: response.taskId });
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

  protected cancelTake(take: StudioTake): void {
    this.eventsStore.cancel(take.id);
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
