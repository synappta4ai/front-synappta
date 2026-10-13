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
import { ProgressSpinner } from 'primeng/progressspinner';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { GpuService } from '../../services/gpu.service';
import { GpuWorker, PairingCode } from '../../interfaces/gpu.interface';

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
    ProgressSpinner,
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
