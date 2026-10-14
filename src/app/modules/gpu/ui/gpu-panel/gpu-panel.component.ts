import { DatePipe } from '@angular/common';
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

import { ConfirmationService } from 'primeng/api';
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

import { GpuService } from '../../services/gpu.service';
import {
  GpuWorker,
  ManagedWorkerModel,
  PairingCode,
} from '../../interfaces/gpu.interface';

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

  protected readonly workers = signal<GpuWorker[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly workerModels = signal<ManagedWorkerModel[]>([]);
  protected readonly modelsLoading = signal(false);
  protected readonly modelsError = signal<string | null>(null);
  protected readonly modelsNotice = signal<string | null>(null);
  protected readonly modelBusy = signal<string | null>(null);
  protected readonly bulkDeleting = signal(false);

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
  protected readonly onlineCount = computed(
    () => this.workers().filter((w) => w.online).length,
  );

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
      });
  }

  /**
   * Catálogo reportado por las GPUs emparejadas (snapshot del bridge).
   * Cuando el worker central no responde, la vista de gestión falla pero las
   * GPUs ya informaron su catálogo en GET /gpu/workers: se muestra eso en
   * modo solo lectura en vez de un error vacío.
   */
  protected readonly bridgeFallbackModels = computed<ManagedWorkerModel[]>(() =>
    this.workers()
      .filter((w) => w.online && Array.isArray(w.models))
      .flatMap((w) =>
        w.models.map((m): ManagedWorkerModel => ({
          name: m.key,
          display_name: m.label || m.key,
          modality: m.mode || '',
          type: 'downloaded' as const,
          downloaded: {
            mode: m.mode || '',
            engine: m.engine || '',
            pipeline: m.pipeline || '',
            repo: m.repo || undefined,
            family: m.family || undefined,
            available: m.available,
            downloading: false,
            download_percent: m.available ? 100 : 0,
            size_bytes: 0,
          },
        })))
  );

  /** ¿Se muestra el catálogo del bridge porque el central no responde? */
  protected readonly showingBridgeCatalog = computed(
    () =>
      this.modelsError() !== null &&
      this.workerModels().length === 0 &&
      this.bridgeFallbackModels().length > 0,
  );

  /** Lo que ve la tabla: gestión central o snapshot del bridge. */
  protected readonly displayedModels = computed<ManagedWorkerModel[]>(() =>
    this.workerModels().length > 0 ? this.workerModels() : this.bridgeFallbackModels(),
  );

  /** Modelos listos para generar (disponibles y sin descarga en curso). */
  protected readonly readyModelCount = computed(
    () =>
      this.displayedModels().filter((model) => model.downloaded?.available && !model.downloaded.downloading)
        .length,
  );

  protected isModelBusy(model: ManagedWorkerModel, action: string): boolean {
    return this.modelBusy() === `${action}:${model.name}`;
  }

  protected startDownload(model: ManagedWorkerModel): void {
    this.runModelOperation(model, 'download');
  }

  protected cancelDownload(model: ManagedWorkerModel): void {
    this.runModelOperation(model, 'cancel');
  }

  /** Desinstalar todo: borra todos los pesos del disco (libera GB). */
  protected deleteAllDownloads(): void {
    if (this.bulkDeleting() || this.workerModels().length === 0) return;
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.MODELS.DELETE_ALL_CONFIRM'),
      header: this.translate.instant('GPU.MODELS.DELETE_ALL'),
      icon: 'md md-warning',
      acceptButtonProps: { label: this.translate.instant('GPU.MODELS.DELETE_ALL'), severity: 'danger' },
      rejectButtonProps: { label: this.translate.instant('GPU.REVOKE_CANCEL'), severity: 'secondary', outlined: true },
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

  /** El borrado libera disco: se confirma porque no se puede deshacer. */
  protected deleteDownload(model: ManagedWorkerModel): void {
    this.confirmationService.confirm({
      message: this.translate.instant('GPU.MODELS.DELETE_CONFIRM', { name: model.display_name || model.name }),
      header: this.translate.instant('GPU.MODELS.DELETE'),
      icon: 'md md-warning',
      acceptButtonProps: { label: this.translate.instant('GPU.MODELS.DELETE'), severity: 'danger' },
      rejectButtonProps: { label: this.translate.instant('GPU.REVOKE_CANCEL'), severity: 'secondary', outlined: true },
      accept: () => this.runModelOperation(model, 'delete'),
    });
  }

  private runModelOperation(model: ManagedWorkerModel, action: 'download' | 'cancel' | 'delete'): void {
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
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
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
      rejectButtonProps: { label: this.translate.instant('GPU.REVOKE_CANCEL'), severity: 'secondary', outlined: true },
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
