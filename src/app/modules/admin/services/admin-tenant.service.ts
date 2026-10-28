import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, EMPTY, finalize } from 'rxjs';

import { UserSessionStore } from '@core/store/user.session';

import { Tenant } from '../interfaces';
import { AdminService } from './admin.service';

/** Último tenant administrado, para sobrevivir a un reload de la consola. */
const TENANT_STORAGE_KEY = 'synapta.admin.tenant';

/**
 * Contexto de la consola de administración: qué tenant se está gestionando.
 * El header de `/admin` es el único selector; cada sección lee de acá para no
 * repetir la carga ni el selector en cada pantalla.
 */
@Injectable({ providedIn: 'root' })
export class AdminTenantService {
  private readonly adminService = inject(AdminService);
  private readonly sessionStore = inject(UserSessionStore);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _tenants = signal<Tenant[]>([]);
  private readonly _selectedTenantId = signal<number | null>(null);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);

  readonly tenants = this._tenants.asReadonly();
  readonly selectedTenantId = this._selectedTenantId.asReadonly();
  readonly loading = this._loading.asReadonly();

  /** La consola es de plataforma: solo el superadmin puede cambiar de tenant. */
  readonly isSuperadmin = computed(() => this.sessionStore.currentUser()?.role_level === 0);

  readonly activeTenants = computed(() => this.tenants().filter((tenant) => tenant.active));

  readonly selectedTenant = computed(
    () => this.tenants().find((tenant) => tenant.id === this._selectedTenantId()) ?? null,
  );

  readonly tenantOptions = computed(() =>
    this.activeTenants().map((tenant) => ({
      label: `${tenant.name} (${tenant.slug})`,
      value: tenant.id,
    })),
  );

  /** Carga la lista una vez; restaura la última selección si sigue vigente. */
  ensureLoaded(): void {
    if (this._loaded() || this._loading()) {
      return;
    }

    if (!this.isSuperadmin()) {
      this._selectedTenantId.set(this.sessionStore.getTenantId());
      this._loaded.set(true);
      return;
    }

    this._loading.set(true);
    this.adminService
      .listTenants()
      .pipe(
        catchError(() => EMPTY),
        finalize(() => {
          this._loading.set(false);
          this._loaded.set(true);
        }),
      )
      .subscribe((tenants) => {
        this._tenants.set(tenants);
        const saved = this.readSavedTenantId();
        const restored = tenants.find((tenant) => tenant.id === saved && tenant.active);
        if (restored) {
          this._selectedTenantId.set(restored.id);
        }
      });
  }

  select(tenantId: number | null): void {
    this._selectedTenantId.set(tenantId);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      if (tenantId === null) {
        localStorage.removeItem(TENANT_STORAGE_KEY);
      } else {
        localStorage.setItem(TENANT_STORAGE_KEY, String(tenantId));
      }
    } catch {
      // Almacenamiento bloqueado (modo privado): la selección vive en memoria.
    }
  }

  /** Refresca la lista (alta/baja de tenants) sin perder la selección. */
  refresh(): void {
    if (!this.isSuperadmin()) {
      return;
    }
    this._loaded.set(false);
    this.ensureLoaded();
  }

  private readSavedTenantId(): number | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    try {
      const raw = localStorage.getItem(TENANT_STORAGE_KEY);
      const id = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }
}
