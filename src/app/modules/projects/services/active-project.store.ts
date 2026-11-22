import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { catchError, EMPTY } from 'rxjs';

import { Event } from '@modules/events/interfaces';
import { EventsService } from '@modules/events/services';

const STORAGE_KEY = 'synapta.active-project';

interface StoredProject {
  id: string;
  name: string;
}

function readStored(platformId: object): StoredProject | null {
  if (!isPlatformBrowser(platformId)) {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredProject>;
    return typeof parsed.id === 'string' && parsed.id
      ? { id: parsed.id, name: typeof parsed.name === 'string' ? parsed.name : '' }
      : null;
  } catch {
    return null;
  }
}

/**
 * Proyecto activo de trabajo: el contexto global que comparten Studio, Agency
 * y Herramientas. Se persiste en el navegador para sobrevivir a la navegación
 * y a los reinicios; las generaciones y recursos se asignan a este proyecto.
 */
@Injectable({ providedIn: 'root' })
export class ActiveProjectStore {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly eventsService = inject(EventsService);

  private readonly _project = signal<StoredProject | null>(readStored(this.platformId));
  private readonly _projects = signal<readonly Event[]>([]);
  private readonly _loading = signal(false);

  readonly project = this._project.asReadonly();
  readonly projects = this._projects.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly projectId = computed(() => this._project()?.id ?? null);
  readonly projectName = computed(() => this._project()?.name ?? '');
  readonly options = computed(() =>
    this._projects().map((project) => ({ label: project.name, value: project.id })),
  );

  constructor() {
    this.refresh();
  }

  /** Recarga el catálogo y descarta el proyecto activo si ya no existe. */
  refresh(): void {
    this._loading.set(true);
    this.eventsService
      .listEvents()
      .pipe(
        catchError(() => {
          this._loading.set(false);
          return EMPTY;
        }),
      )
      .subscribe((projects) => {
        this._projects.set(projects);
        this._loading.set(false);
        const current = this._project();
        if (!current) {
          return;
        }
        const found = projects.find((project) => project.id === current.id);
        if (found) {
          if (found.name !== current.name) {
            this._project.set({ id: found.id, name: found.name });
            this.persist();
          }
        } else {
          this.clear();
        }
      });
  }

  select(project: Event | StoredProject | null): void {
    if (!project) {
      this.clear();
      return;
    }
    this._project.set({ id: project.id, name: project.name });
    this.persist();
  }

  clear(): void {
    this._project.set(null);
    this.persist();
  }

  private persist(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const project = this._project();
      if (project) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      return;
    }
  }
}
