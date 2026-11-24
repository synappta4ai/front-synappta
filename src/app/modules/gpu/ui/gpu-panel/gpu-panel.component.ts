import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, finalize } from 'rxjs';

import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { formatBytesValue } from '@pipes/format-bytes.pipe';

import { GpuService } from '../../services/gpu.service';
import {
  GpuWorker,
  ManagedWorkerModel,
  ModelFit,
  PairingCode,
} from '../../interfaces/gpu.interface';

/**
 * Margen sobre la VRAM del catálogo para decir "corre cómodo".
 *
 * `vram_gb` es el pico que necesita el pipeline; el resto (activaciones,
 * contextos de CUDA, el escritorio) no está incluido, así que con el spec justo
 * el modelo entra pero deja la GPU al límite. 25 % es el colchón con el que se
 * midió Wan 2.1 en 8 GB (spec 6 GB, pico real 5,98 GB).
 */
const FIT_HEADROOM = 1.25;

/** Menos de 5 GB libres en el disco del worker: aviso visible en el panel. */
const LOW_DISK_WARN_MB = 5 * 1024;

/** Menos de 1 GB: no entra ningún modelo, no se ofrecen más descargas. */
const LOW_DISK_BLOCK_MB = 1024;

/**
 * El estado de la actualización remota no se deduce de un reloj: lo reporta el
 * agente (`failed_update` con el motivo real) o, si el worker no vuelve del
 * reinicio, el watchdog del back. Antes los 5 minutos desde el pedido marcaban
 * «falló» mientras el worker esperaba legítimamente a que terminara un job.
 */

/**
 * Panel "Tu GPU": el administrador del tenant empareja las máquinas con GPU
 * de su equipo. Flujo pensado para usuarios sin conocimiento técnico:
 *
 *   1. Click en "Conectar GPU" → la app muestra un código de 6 dígitos.
 *   2. En la máquina con la GPU se ejecuta `python pair.py` y se pega el
 *      código (el README del worker lo explica paso a paso).
 *   3. La máquina aparece acá en línea y empieza a recibir trabajos.
 *
 * La lista se refresca sola cada 10 s mientras el panel está abierto.
 */
@Component({
  selector: 'app-gpu-panel',
  imports: [
    DatePipe,
    DecimalPipe,
    Button,
    Card,
    ConfirmDialog,
    Dialog,
    Message,
    ProgressBar,
    ProgressSpinner,
    TableModule,
    Tag,
    Tooltip,
    TranslatePipe,
  ],
  providers: [ConfirmationService],
  templateUrl: './gpu-panel.component.html',
  styleUrl: './gpu-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GpuPanelComponent implements OnInit, OnDestroy {
  private readonly gpuService = inject(GpuService);
  private readonly translate = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly workers = signal<GpuWorker[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly workerModels = signal<ManagedWorkerModel[]>([]);
  protected readonly modelsLoading = signal(false);
  protected readonly modelsError = signal<string | null>(null);
  protected readonly modelsNotice = signal<string | null>(null);
  protected readonly modelBusy = signal<string | null>(null);
  protected readonly bulkDeleting = signal(false);
  /** Worker cuya actualización remota se está encolando. */
  protected readonly updateBusy = signal<string | null>(null);
  /** GPU cuya pausa/reanudación está en vuelo. */
  protected readonly pauseBusy = signal<string | null>(null);
  /** GPU que se está editando (nombre/etiqueta) en el diálogo. */
  protected readonly editingWorker = signal<GpuWorker | null>(null);
  protected readonly editName = signal('');
  protected readonly editLabel = signal('');
  protected readonly editSaving = signal(false);

  /** Actualización del worker: estado y mensaje al usuario. */
  protected readonly updateWorkerLoading = signal(false);
  protected readonly updateWorkerMessage = signal<string | null>(null);
  protected readonly selectedUpdateFile = signal<File | null>(null);

  /**
   * Instalador gráfico de Windows (.exe, onefile): doble click y corre la
   * GUI que instala, empareja y arranca — sin terminal ni Python previo.
   * Se sirve como asset estático del front: mismo origen, sin pasar por el back.
   */
  protected readonly exeDownloadUrl = 'assets/worker/SynaptaWorker-Setup.exe';

  /**
   * Fallback para macOS/Linux: zip con el código del worker y los scripts
   * de setup (mismo contenido que extrae el .exe).
   */
  protected readonly zipDownloadUrl = 'assets/worker/synapta-worker.zip';

  protected readonly pairingVisible = signal(false);
  protected readonly pairing = signal<PairingCode | null>(null);
  protected readonly pairingLoading = signal(false);
  protected readonly secondsLeft = signal(0);
  protected readonly codeCopied = signal(false);

  /** Workers online ahora (heartbeat reciente). El back ya calcula `online`. */
  protected readonly onlineCount = computed(() => this.workers().filter((w) => w.online).length);

  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.load();
    // Refresco periódico: la lista es el "panel de estado" de las GPUs.
    this.refreshTimer = setInterval(() => this.load(true), 10_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  protected load(silent = false): void {
    this.loadWorkers(silent);
    this.loadWorkerModels(silent);
  }

  private loadWorkers(silent = false): void {
    if (!silent) this.loading.set(true);
    this.gpuService
      .listWorkers()
      .pipe(
        catchError(() => {
          if (!silent) {
            this.error.set(this.translate.instant('GPU.ERRORS.LOAD'));
          }
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((workers) => {
        this.workers.set(workers);
        this.error.set(null);
      });
  }

  /** ¿El catálogo vino del bridge (solo lectura, sin gestión de pesos)? */
  protected readonly bridgeSource = signal(false);

  /** ¿Vista de solo lectura? Snapshot local o backend en modo bridge. */
  protected readonly bridgeMode = computed(
    () => this.showingBridgeCatalog() || this.bridgeSource(),
  );

  private loadWorkerModels(silent = false): void {
    if (!silent) this.modelsLoading.set(true);
    this.gpuService
      .listWorkerModels()
      .pipe(
        catchError(() => {
          if (!silent) {
            this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.LOAD'));
          }
          return EMPTY;
        }),
        finalize(() => this.modelsLoading.set(false)),
      )
      .subscribe(({ models, bridge }) => {
        this.workerModels.set(models);
        this.bridgeSource.set(bridge);
        this.modelsError.set(null);
        this.trackDownloads(models);
      });
  }

  /**
   * Catálogo reportado por las GPUs emparejadas (snapshot del bridge).
   * Cuando el worker central no responde, la vista de gestión falla pero las
   * GPUs ya informaron su catálogo en GET /gpu/workers: se muestra eso con
   * descarga por worker (el agente la recoge en el próximo heartbeat).
   * Si varias GPUs reportan el mismo modelo, gana la primera en línea.
   */
  protected readonly bridgeFallbackModels = computed<ManagedWorkerModel[]>(() => {
    const seen = new Set<string>();
    const out: ManagedWorkerModel[] = [];
    for (const w of this.workers()) {
      if (!w.online || !Array.isArray(w.models)) continue;
      for (const m of w.models) {
        if (!m?.key || seen.has(m.key)) continue;
        seen.add(m.key);
        const downloading = m.downloading ?? false;
        out.push({
          name: m.key,
          display_name: m.label || m.key,
          modality: m.mode || '',
          type: 'downloaded' as const,
          worker_id: w.id,
          worker_name: w.name,
          worker_version: w.version,
          downloaded: {
            mode: m.mode || '',
            engine: m.engine || '',
            pipeline: m.pipeline || '',
            repo: m.repo || undefined,
            family: m.family || undefined,
            available: m.available,
            downloading,
            download_percent: m.download_percent ?? (m.available ? 100 : 0),
            size_bytes: m.size_bytes ?? 0,
            download_error: m.download_error || undefined,
          },
        });
      }
    }
    return out;
  }); /** ¿Se muestra el catálogo del bridge porque el central no responde? */
  protected readonly showingBridgeCatalog = computed(
    () =>
      this.modelsError() !== null &&
      this.workerModels().length === 0 &&
      this.bridgeFallbackModels().length > 0,
  );

  /**
   * GPU que reportó cada modelo (GET /gpu/workers), por clave en minúsculas.
   * El modo bridge necesita la identidad para encolar la descarga ahí; los
   * backs todavía desplegados no la mandan por modelo, así que se resuelve
   * acá desde la lista de GPUs emparejadas.
   */
  private readonly workerIndex = computed(() => {
    const index = new Map<string, GpuWorker>();
    for (const w of this.workers()) {
      if (!w.online || !Array.isArray(w.models)) continue;
      for (const m of w.models) {
        const key = (m?.key || '').toLowerCase();
        if (key && !index.has(key)) index.set(key, w);
      }
    }
    return index;
  });

  /** Lo que ve la tabla: gestión central o snapshot del bridge. */
  protected readonly displayedModels = computed<ManagedWorkerModel[]>(() => {
    const list = this.workerModels().length > 0 ? this.workerModels() : this.bridgeFallbackModels();
    if (!this.bridgeMode()) return list;
    const index = this.workerIndex();
    return list.map((model) => {
      if (model.worker_id) return model;
      const worker = index.get((model.name || '').toLowerCase());
      if (!worker) return model;
      return {
        ...model,
        worker_id: worker.id,
        worker_name: worker.name,
        worker_version: worker.version,
      };
    });
  });

  /**
   * Un modelo gestionable pesa en disco: se descarga de Hugging Face y se
   * borra para liberar espacio. `mock` genera artefactos simulados sin pesos y
   * `v1_bridge` carga checkpoints de un volumen montado: ninguno de los dos se
   * puede descargar ni borrar desde este panel, así que no se listan acá (sí
   * aparecen en los selectores de generación cuando están disponibles).
   */
  protected hasDownloadableWeights(model: ManagedWorkerModel): boolean {
    const dl = model.downloaded;
    if (!dl) return false;
    if (dl.engine === 'mock' || dl.engine === 'v1_bridge') return false;
    return !!dl.repo || dl.engine === 'diffusers';
  }

  /**
   * Tabla de pesos: sólo modelos con pesos de HF. Por eso toda fila arranca
   * "sin descargar", ofrece Descargar y, cuando los pesos están en disco,
   * Borrar — nada llega pre-descargado por el solo hecho de estar en el
   * catálogo.
   */
  protected readonly weightModels = computed(() =>
    this.displayedModels().filter((model) => this.hasDownloadableWeights(model)),
  );

  /** Modelos del catálogo que no tienen pesos descargables (mock / bridge). */
  protected readonly weightlessCount = computed(
    () => this.displayedModels().length - this.weightModels().length,
  );

  /**
   * GPU de referencia para las recomendaciones: la que más VRAM tiene entre
   * las emparejadas (las online primero; si ninguna late, igual se muestra la
   * última conocida). El catálogo se compara contra esta máquina porque es la
   * que puede correr el modelo hoy.
   */
  protected readonly targetGpu = computed<GpuWorker | null>(() => {
    const all = this.workers();
    const online = all.filter((w) => w.online);
    const pool = online.length > 0 ? online : all;
    return [...pool].sort((a, b) => b.vram_total_mb - a.vram_total_mb)[0] ?? null;
  });

  /** VRAM total de la GPU objetivo en MB (0 si no hay ninguna). */
  protected readonly hardwareVramMb = computed(() => this.targetGpu()?.vram_total_mb ?? 0);

  /**
   * ¿Este modelo entra en la GPU objetivo?
   *
   * Se compara el `vram_gb` del catálogo (spec del pipeline, el mismo dato que
   * usa el worker para dimensionar la máquina) contra la VRAM total que la GPU
   * reportó en su heartbeat. Sin GPU o sin spec no se inventa un veredicto.
   */
  protected modelFit(model: ManagedWorkerModel): ModelFit {
    const needGb = model.downloaded?.vram_gb ?? 0;
    const totalMb = this.hardwareVramMb();
    if (needGb <= 0 || totalMb <= 0) return 'unknown';
    const totalGb = totalMb / 1024;
    if (totalGb >= needGb * FIT_HEADROOM) return 'good';
    if (totalGb >= needGb) return 'tight';
    return 'insufficient';
  }

  /** Cuántos modelos de la tabla entran cómodos, justos o no entran. */
  protected readonly hardwareSummary = computed(() => {
    const summary = { good: 0, tight: 0, insufficient: 0, unknown: 0, total: 0 };
    for (const model of this.weightModels()) {
      summary.total += 1;
      summary[this.modelFit(model)] += 1;
    }
    return summary;
  });

  /**
   * Modelos que conviene descargar en esta GPU: los que entran y todavía no
   * están en disco. Primero los que corren cómodos y, dentro de cada grupo, de
   * menor a mayor VRAM (el más liviano tarda menos y sirve para probar).
   */
  protected readonly recommendedModels = computed<ManagedWorkerModel[]>(() => {
    const rank = (fit: ModelFit) => (fit === 'good' ? 0 : fit === 'tight' ? 1 : 2);
    return this.weightModels()
      .filter((model) => !model.downloaded?.available && !model.downloaded?.downloading)
      .filter((model) => rank(this.modelFit(model)) < 2)
      .sort(
        (a, b) =>
          rank(this.modelFit(a)) - rank(this.modelFit(b)) ||
          (a.downloaded?.vram_gb ?? 0) - (b.downloaded?.vram_gb ?? 0),
      )
      .slice(0, 4);
  });

  /**
   * Requisitos honestos para instalar el worker, derivados del catálogo real:
   * el modelo más liviano marca el mínimo y el más pesado, el techo.
   */
  protected readonly workerRequirements = computed(() => {
    const needs = this.weightModels()
      .map((model) => model.downloaded?.vram_gb ?? 0)
      .filter((gb) => gb > 0);
    if (needs.length === 0) return { minGb: 0, recommendedGb: 0, maxGb: 0, models: 0 };
    const minGb = Math.min(...needs);
    return {
      minGb,
      recommendedGb: Math.ceil(minGb * FIT_HEADROOM),
      maxGb: Math.max(...needs),
      models: needs.length,
    };
  });

  /** Disco libre en la GPU objetivo (0 si el worker todavía no lo reporta). */
  protected readonly diskFreeMb = computed(() => this.targetGpu()?.disk_free_mb ?? 0);

  /** Poco espacio: se avisa, pero las descargas chicas todavía pueden entrar. */
  protected readonly lowDisk = computed(() => {
    const free = this.diskFreeMb();
    return free > 0 && free < LOW_DISK_WARN_MB;
  });

  /** Sin espacio para pesos: se bloquean las descargas en vez de fallar al final. */
  protected readonly diskFull = computed(() => {
    const free = this.diskFreeMb();
    return free > 0 && free < LOW_DISK_BLOCK_MB;
  });

  /**
   * Muestreo de las descargas en curso para estimar velocidad y ETA.
   *
   * El back solo manda porcentaje y bytes en disco; con dos muestras separadas
   * por el refresco del panel (10 s) alcanza para derivar ambos sin tocar el
   * worker. Se guarda por modelo porque puede haber una descarga por GPU.
   */
  private readonly downloadSamples = signal<
    Record<string, { percent: number; bytes: number; at: number }>
  >({});

  /** Velocidad (bytes/s) y ETA (s) por modelo, cuando ya hay dos muestras. */
  protected readonly downloadRates = signal<Record<string, { speed: number; eta: number }>>({});

  protected downloadRate(model: ManagedWorkerModel): { speed: number; eta: number } | null {
    return this.downloadRates()[model.name] ?? null;
  }

  /** Modelos listos para generar (disponibles y sin descarga en curso). */
  protected readonly readyModelCount = computed(
    () =>
      this.weightModels().filter(
        (model) => model.downloaded?.available && !model.downloaded.downloading,
      ).length,
  );

  protected isModelBusy(model: ManagedWorkerModel, action: string): boolean {
    return this.modelBusy() === `${action}:${model.name}`;
  }

  /**
   * Descarga en modo bridge: encola el modelo en la GPU que lo reportó.
   * El agente lo toma en el próximo heartbeat (~20 s) y el progreso real
   * aparece en el snapshot (downloading/download_percent).
   */
  protected bridgeDownload(model: ManagedWorkerModel): void {
    if (this.modelBusy() || !model.worker_id) return;
    this.modelBusy.set(`download:${model.name}`);
    this.modelsError.set(null);
    this.modelsNotice.set(null);
    this.gpuService
      .requestBridgeDownload(model.worker_id, model.name)
      .pipe(
        catchError(() => {
          this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.OPERATION'));
          return EMPTY;
        }),
        finalize(() => this.modelBusy.set(null)),
      )
      .subscribe(() => {
        this.modelsNotice.set(
          this.translate.instant('GPU.MODELS.DOWNLOAD_REQUESTED', {
            name: model.display_name || model.name,
            worker: model.worker_name || '',
          }),
        );
        this.load(true);
      });
  }

  /**
   * Cancelar una descarga en modo bridge: el back saca el pedido de la cola si
   * todavía no arrancó y encola la cancelación. El agente aborta la
   * transferencia en el próximo heartbeat (~20 s) y descarta los bytes
   * parciales, así que el modelo vuelve a quedar "sin descargar".
   */
  protected bridgeCancelDownload(model: ManagedWorkerModel): void {
    if (this.modelBusy() || !model.worker_id) return;
    this.modelBusy.set(`cancel:${model.name}`);
    this.modelsError.set(null);
    this.modelsNotice.set(null);
    this.gpuService
      .requestBridgeDownloadCancel(model.worker_id, model.name)
      .pipe(
        catchError(() => {
          this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.OPERATION'));
          return EMPTY;
        }),
        finalize(() => this.modelBusy.set(null)),
      )
      .subscribe(() => {
        this.modelsNotice.set(
          this.translate.instant('GPU.MODELS.CANCEL_REQUESTED', {
            name: model.display_name || model.name,
            worker: model.worker_name || '',
          }),
        );
        this.load(true);
      });
  }

  /**
   * Borrado en modo bridge: encola el pedido en la GPU que reportó el modelo.
   * El agente lo ejecuta en el próximo heartbeat (~20 s), libera el disco de esa
   * máquina y lo confirma; el snapshot siguiente ya lo muestra sin pesos.
   */
  protected bridgeDelete(model: ManagedWorkerModel): void {
    if (this.modelBusy() || !model.worker_id) return;
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.MODELS.DELETE_CONFIRM', {
        name: model.display_name || model.name,
      }),
      header: this.translate.instant('GPU.MODELS.DELETE'),
      icon: 'md md-warning',
      acceptButtonProps: {
        label: this.translate.instant('GPU.MODELS.DELETE'),
        severity: 'danger',
      },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => {
        this.modelBusy.set(`delete:${model.name}`);
        this.modelsError.set(null);
        this.modelsNotice.set(null);
        this.gpuService
          .requestBridgeDeletion(model.worker_id!, model.name)
          .pipe(
            catchError(() => {
              this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.OPERATION'));
              return EMPTY;
            }),
            finalize(() => this.modelBusy.set(null)),
          )
          .subscribe(() => {
            this.modelsNotice.set(
              this.translate.instant('GPU.MODELS.DELETE_REQUESTED', {
                name: model.display_name || model.name,
                worker: model.worker_name || '',
              }),
            );
            this.load(true);
          });
      },
    });
  }

  /**
   * Estado de la actualización remota de esa GPU:
   *
   *  - `idle`    — sin pedido: el botón ofrece actualizar.
   *  - `pending` — el agente la está aplicando: «Actualizando…» y botón bloqueado
   *                (reemplazar el pedido en vuelo perdería la confirmación).
   *  - `failed`  — el worker reportó que no se aplicó (o el back la dio por
   *                fallida porque no volvió del reinicio): se muestra el motivo
   *                y se ofrece reintentar, que reemplaza el pedido viejo.
   */
  protected updateState(worker: GpuWorker): 'idle' | 'pending' | 'failed' {
    if (worker.requested_update) return 'pending';
    if (worker.update_failure) return 'failed';
    return 'idle';
  }

  /** Motivo del fallo reportado por el worker (lo escribe el updater). */
  protected updateFailureReason(worker: GpuWorker): string {
    const reason = worker.update_failure?.error?.trim();
    return reason || this.translate.instant('GPU.UPDATE_FAILED_NO_REASON');
  }

  /**
   * Actualización remota en modo bridge: encola el pedido con el .zip que sirve
   * este front. El agente lo baja, se reinicia y vuelve solo, así que el tag de
   * versión se actualiza recién con el heartbeat nuevo; mientras tanto el
   * pedido sigue pendiente y la tarjeta muestra «Actualizando…». Si no vuelve
   * (o el worker la ignora), el pedido vence y la tarjeta ofrece reintentar.
   */
  protected bridgeUpdate(worker: GpuWorker): void {
    const state = this.updateState(worker);
    // Con el pedido vigente no se re-encola; si falló, reintentar sí (el back
    // reemplaza el anterior). A una GPU offline se le puede re-encolar: se
    // aplica cuando vuelva; arrancar una actualización nueva, no.
    if (this.updateBusy() || state === 'pending' || (state === 'idle' && !worker.online)) return;
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.UPDATE_CONFIRM', {
        name: worker.name,
        version: worker.version || '—',
      }),
      header: this.translate.instant('GPU.UPDATE'),
      icon: 'md md-system_update',
      acceptButtonProps: { label: this.translate.instant('GPU.UPDATE'), severity: 'primary' },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => {
        this.updateBusy.set(worker.id);
        this.error.set(null);
        // Mismo .zip que ofrece la tarjeta: el front que ve el admin es el que
        // sirve el payload, sin depender de una URL fija de dev en el agente.
        const url = new URL(this.zipDownloadUrl, document.baseURI).toString();
        this.gpuService
          .requestBridgeUpdate(worker.id, url)
          .pipe(
            catchError((err: unknown) => {
              this.error.set(this.updateErrorMessage(err, worker));
              return EMPTY;
            }),
            finalize(() => this.updateBusy.set(null)),
          )
          .subscribe(() => {
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('GPU.UPDATE_REQUESTED_TITLE'),
              detail: this.translate.instant('GPU.UPDATE_REQUESTED', { name: worker.name }),
            });
            this.load(true);
          });
      },
    });
  }

  /**
   * Mensaje de error al encolar la actualización. Un 409 es el back diciendo que
   * esa máquina no puede aplicarla sola (versión vieja que ignora el pedido):
   * la salida es el instalador, no reintentar.
   */
  private updateErrorMessage(err: unknown, worker: GpuWorker): string {
    if ((err as { status?: number })?.status === 409) {
      return this.translate.instant('GPU.ERRORS.UPDATE_NEEDS_INSTALLER', {
        name: worker.name,
        version: worker.version || '—',
      });
    }
    return this.translate.instant('GPU.ERRORS.UPDATE');
  }

  /**
   * Pausa (drenaje) o reanuda la GPU. En pausa termina el job en curso y no
   * reclama nuevos, sin desemparejarla: la máquina sigue latiendo y el panel la
   * sigue viendo en línea. Reanudar no pide confirmación (es reversible).
   */
  protected togglePause(worker: GpuWorker): void {
    if (this.pauseBusy()) return;
    if (worker.paused) {
      this.setPaused(worker, false);
      return;
    }
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.PAUSE_CONFIRM', { name: worker.name }),
      header: this.translate.instant('GPU.PAUSE'),
      icon: 'md md-pause_circle',
      acceptButtonProps: { label: this.translate.instant('GPU.PAUSE'), severity: 'primary' },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => this.setPaused(worker, true),
    });
  }

  private setPaused(worker: GpuWorker, paused: boolean): void {
    this.pauseBusy.set(worker.id);
    this.error.set(null);
    this.gpuService
      .updateBridgeWorker(worker.id, { paused })
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('GPU.ERRORS.SETTINGS'));
          return EMPTY;
        }),
        finalize(() => this.pauseBusy.set(null)),
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(paused ? 'GPU.PAUSED_TITLE' : 'GPU.RESUMED_TITLE'),
          detail: this.translate.instant(paused ? 'GPU.PAUSED_TOAST' : 'GPU.RESUMED_TOAST', {
            name: worker.name,
          }),
        });
        this.load(true);
      });
  }

  /** Abre el diálogo de nombre/etiqueta con los valores actuales de la GPU. */
  protected openEdit(worker: GpuWorker): void {
    this.editingWorker.set(worker);
    this.editName.set(worker.name);
    this.editLabel.set(worker.label ?? '');
  }

  protected closeEdit(): void {
    this.editingWorker.set(null);
    this.editSaving.set(false);
  }

  protected saveEdit(): void {
    const worker = this.editingWorker();
    if (!worker || this.editSaving()) return;
    const name = this.editName().trim();
    if (!name) return;
    this.editSaving.set(true);
    this.gpuService
      .updateBridgeWorker(worker.id, { name, label: this.editLabel().trim() })
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('GPU.ERRORS.SETTINGS'));
          return EMPTY;
        }),
        finalize(() => this.editSaving.set(false)),
      )
      .subscribe(() => {
        this.closeEdit();
        this.load(true);
      });
  }

  protected startDownload(model: ManagedWorkerModel): void {
    this.runModelOperation(model, 'download');
  }

  protected cancelDownload(model: ManagedWorkerModel): void {
    this.runModelOperation(model, 'cancel');
  }

  /** Desinstalar todo: borra todos los pesos del disco (libera GB). */
  protected deleteAllDownloads(): void {
    if (this.bulkDeleting() || this.weightModels().length === 0) return;
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.MODELS.DELETE_ALL_CONFIRM'),
      header: this.translate.instant('GPU.MODELS.DELETE_ALL'),
      icon: 'md md-warning',
      acceptButtonProps: {
        label: this.translate.instant('GPU.MODELS.DELETE_ALL'),
        severity: 'danger',
      },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => {
        this.bulkDeleting.set(true);
        this.modelsError.set(null);
        this.modelsNotice.set(null);
        this.gpuService
          .deleteAllWorkerModels()
          .pipe(
            catchError(() => {
              this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.OPERATION'));
              return EMPTY;
            }),
            finalize(() => this.bulkDeleting.set(false)),
          )
          .subscribe((result) => {
            const failed = Object.keys(result.failed ?? {}).length;
            this.modelsNotice.set(
              this.translate.instant('GPU.MODELS.DELETE_ALL_DONE', {
                count: result.deleted.length,
                size: this.formatSize(result.freed_bytes),
                failed,
              }),
            );
            this.loadWorkerModels(true);
          });
      },
    });
  }

  /**
   * El borrado libera disco: se confirma porque no se puede deshacer, y sólo
   * tiene sentido si hay bytes en disco. No se exige `available`:
   * una descarga a medias deja pesos incompletos que no se pueden usar y sí
   * ocupan disco, así que también se tienen que poder borrar. Con una descarga
   * en curso primero se cancela.
   */
  protected canDelete(model: ManagedWorkerModel): boolean {
    const dl = model.downloaded;
    return !!dl && !dl.downloading && dl.size_bytes > 0;
  }

  protected deleteDownload(model: ManagedWorkerModel): void {
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.MODELS.DELETE_CONFIRM', {
        name: model.display_name || model.name,
      }),
      header: this.translate.instant('GPU.MODELS.DELETE'),
      icon: 'md md-warning',
      acceptButtonProps: { label: this.translate.instant('GPU.MODELS.DELETE'), severity: 'danger' },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => this.runModelOperation(model, 'delete'),
    });
  }

  /**
   * Compara la lista nueva con la anterior: calcula velocidad/ETA de lo que
   * sigue bajando y avisa cuando algo terminó (bien o mal) mientras el panel
   * estaba abierto.
   */
  private trackDownloads(models: ManagedWorkerModel[]): void {
    const now = Date.now();
    const previous = this.downloadSamples();
    const next: Record<string, { percent: number; bytes: number; at: number }> = {};
    const rates: Record<string, { speed: number; eta: number }> = {};
    for (const model of models) {
      const download = model.downloaded;
      if (!download) continue;
      const percent = this.downloadProgress(model);
      const bytes = download.size_bytes ?? 0;
      if (download.downloading) {
        const before = previous[model.name];
        if (before) {
          const seconds = (now - before.at) / 1000;
          const gained = bytes - before.bytes;
          const percentGained = percent - before.percent;
          if (seconds > 0 && gained > 0) {
            rates[model.name] = {
              speed: gained / seconds,
              eta: percentGained > 0 ? ((100 - percent) * seconds) / percentGained : 0,
            };
          }
        }
        next[model.name] = { percent, bytes, at: now };
        continue;
      }
      // Dejó de descargar entre dos refrescos: terminó o falló.
      if (!previous[model.name]) continue;
      const name = model.display_name || model.name;
      if (download.available) {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('GPU.TOAST.DOWNLOAD_DONE_TITLE'),
          detail: this.translate.instant('GPU.TOAST.DOWNLOAD_DONE', { name }),
        });
      } else if (download.download_error) {
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('GPU.TOAST.DOWNLOAD_FAILED_TITLE'),
          detail: this.translate.instant('GPU.TOAST.DOWNLOAD_FAILED', {
            name,
            error: download.download_error,
          }),
        });
      }
    }
    this.downloadSamples.set(next);
    this.downloadRates.set(rates);
  }

  protected formatSpeed(bytesPerSecond: number): string {
    return `${this.formatSize(Math.round(bytesPerSecond))}/s`;
  }

  /** ETA compacta: segundos, minutos u horas+minutos. Vacío si no se sabe. */
  protected formatEta(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  private runModelOperation(
    model: ManagedWorkerModel,
    action: 'download' | 'cancel' | 'delete',
  ): void {
    if (this.modelBusy()) return;
    this.modelBusy.set(`${action}:${model.name}`);
    this.modelsError.set(null);
    const request =
      action === 'download'
        ? this.gpuService.downloadWorkerModel(model.name)
        : action === 'cancel'
          ? this.gpuService.cancelWorkerModelDownload(model.name)
          : this.gpuService.deleteWorkerModel(model.name);
    request
      .pipe(
        catchError(() => {
          this.modelsError.set(this.translate.instant('GPU.MODELS.ERRORS.OPERATION'));
          return EMPTY;
        }),
        finalize(() => this.modelBusy.set(null)),
      )
      .subscribe(() => this.loadWorkerModels(true));
  }

  protected downloadProgress(model: ManagedWorkerModel): number {
    const progress = model.downloaded?.download_percent ?? 0;
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  protected formatSize(bytes: number): string {
    return formatBytesValue(bytes);
  }

  /** true si esta sesión corre en Windows (ahí va el .exe, no el zip). */
  private get isWindows(): boolean {
    return /Windows|Win32|Win64/i.test(navigator.userAgent ?? '');
  }

  /**
   * Dispara la descarga del worker sin salir de la página.
   * Windows → SynaptaWorker-Setup.exe (lo que quiere el cliente: un click
   * y doble click); el resto de sistemas → zip con el código.
   */
  protected downloadWorker(): void {
    const windows = this.isWindows;
    const link = document.createElement('a');
    link.href = windows ? this.exeDownloadUrl : this.zipDownloadUrl;
    link.download = windows ? 'SynaptaWorker-Setup.exe' : 'synapta-worker.zip';
    link.rel = 'noopener';
    document.body.appendChild(link); // Firefox no dispara clicks de links sueltos
    link.click();
    link.remove();
  }

  /** El usuario eligió el .zip nuevo del worker para actualizarlo. */
  protected onUpdateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedUpdateFile.set(input.files?.[0] ?? null);
    this.updateWorkerMessage.set(null);
  }

  /**
   * Sube el .zip al back y ordena al worker que se auto-actualice.
   * El worker se detiene, reemplaza archivos y se relanza solo.
   */
  protected async updateWorker(): Promise<void> {
    const file = this.selectedUpdateFile();
    if (!file) {
      this.updateWorkerMessage.set('Seleccioná un archivo .zip primero.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      this.updateWorkerMessage.set('El archivo debe ser un .zip.');
      return;
    }
    this.updateWorkerLoading.set(true);
    this.updateWorkerMessage.set(null);
    try {
      const url = await this.gpuService.uploadWorkerUpdatePayload(file);
      await this.gpuService.updateWorker(url);
      this.updateWorkerMessage.set('Actualización enviada: el worker se reiniciará al terminar.');
      this.selectedUpdateFile.set(null);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (err) {
      this.updateWorkerMessage.set(
        err instanceof Error ? err.message : 'Error actualizando el worker.',
      );
    } finally {
      this.updateWorkerLoading.set(false);
    }
  }

  /** Click principal: generar un código de emparejamiento nuevo. */
  protected requestPairingCode(): void {
    this.pairingLoading.set(true);
    this.gpuService
      .createPairingCode()
      .pipe(
        catchError(() => {
          this.error.set(this.translate.instant('GPU.ERRORS.PAIRING'));
          return EMPTY;
        }),
        finalize(() => this.pairingLoading.set(false)),
      )
      .subscribe((code) => {
        this.pairing.set(code);
        this.pairingVisible.set(true);
        this.codeCopied.set(false);
        this.startCountdown(code);
      });
  }

  /** Copia el código al portapapeles (botón junto al código grande). */
  protected copyCode(): void {
    const code = this.pairing()?.code;
    if (!code) return;
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        this.codeCopied.set(true);
        setTimeout(() => this.codeCopied.set(false), 2000);
      })
      .catch(() => {
        /* sin permiso de portapapeles: el usuario puede leerlo a ojo */
      });
  }

  protected closePairing(): void {
    this.pairingVisible.set(false);
    this.pairing.set(null);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  /** Revoca el token de una GPU (queda fuera hasta volver a emparejar). */
  protected revoke(worker: GpuWorker): void {
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.REVOKE_CONFIRM', { name: worker.name }),
      header: this.translate.instant('GPU.REVOKE'),
      icon: 'md md-warning',
      acceptButtonProps: { label: this.translate.instant('GPU.REVOKE'), severity: 'danger' },
      rejectButtonProps: {
        label: this.translate.instant('GPU.REVOKE_CANCEL'),
        severity: 'secondary',
        outlined: true,
      },
      accept: () => {
        this.gpuService
          .revokeWorker(worker.id)
          .pipe(catchError(() => EMPTY))
          .subscribe(() => this.load(true));
      },
    });
  }

  protected vramGb(mb: number): string {
    return mb > 0 ? `${(mb / 1024).toFixed(1)} GB` : '—';
  }

  private startCountdown(code: PairingCode): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const expires = new Date(code.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      this.secondsLeft.set(left);
      if (left <= 0 && this.countdownTimer) clearInterval(this.countdownTimer);
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }
}
