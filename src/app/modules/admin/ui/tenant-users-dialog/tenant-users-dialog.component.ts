import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';

import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { AdminService } from '../../services/admin.service';
import { PermissionDef, PlatformUser, Tenant, TenantMember } from '../../interfaces';

const ROLE_OPTIONS = [
  { label: 'SUPER_ADMIN (0)', value: 0 },
  { label: 'ADMIN (1)', value: 1 },
  { label: 'DIRECTOR (2)', value: 2 },
  { label: 'USER (3)', value: 3 },
];

@Component({
  selector: 'app-tenant-users-dialog',
  imports: [FormsModule, Dialog, Button, InputText, Message, Select, Tag],
  templateUrl: './tenant-users-dialog.component.html',
  styleUrls: ['./tenant-users-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantUsersDialogComponent {
  private readonly adminService = inject(AdminService);

  /** Tenant en gestión (null = diálogo cerrado). */
  readonly tenant = input<Tenant | null>(null);
  readonly closed = output<void>();

  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly members = signal<TenantMember[]>([]);
  protected readonly catalog = signal<PermissionDef[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  /** Pestaña del formulario de alta: nuevo usuario global o existente. */
  protected readonly mode = signal<'new' | 'existing'>('new');
  protected readonly form = {
    username: '',
    password: '',
    name: '',
    surname: '',
    email: '',
    role: 3,
    perms: {} as Record<string, boolean>,
  };
  protected readonly search = signal('');
  protected readonly results = signal<PlatformUser[]>([]);
  protected readonly attachRole = 3;
  protected readonly attachPerms = signal<Set<string>>(new Set());

  /** Miembro con el panel de permisos expandido. */
  protected readonly editingPerms = signal<number | null>(null);
  protected readonly editPerms = signal<Set<string>>(new Set());

  protected readonly tenantId = computed(() => this.tenant()?.id ?? 0);
  protected readonly visible = computed(() => this.tenant() !== null);
  protected readonly header = computed(() => `Usuarios · ${this.tenant()?.name ?? ''}`);

  /** Se ejecuta cada vez que el diálogo se muestra (p-dialog onShow). */
  protected onShow(): void {
    this.error.set('');
    this.loadMembers();
    if (this.catalog().length === 0) {
      this.adminService
        .listPermissionCatalog()
        .pipe(catchError(() => EMPTY))
        .subscribe((defs) => this.catalog.set(defs));
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  private loadMembers(): void {
    const id = this.tenantId();
    if (!id) return;
    this.loading.set(true);
    this.adminService
      .listTenantMembers(id)
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron cargar los usuarios del tenant.');
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe((members) => this.members.set(members));
  }

  // ─── Alta ───────────────────────────────────────────────────

  protected setMode(mode: 'new' | 'existing'): void {
    this.mode.set(mode);
    this.error.set('');
    this.results.set([]);
  }

  protected selectedPermKeys(): string[] {
    return Object.entries(this.form.perms)
      .filter(([, on]) => on)
      .map(([k]) => k);
  }

  protected createNew(): void {
    const id = this.tenantId();
    if (!id || this.saving()) return;
    if (!this.form.username.trim() || this.form.password.length < 8) {
      this.error.set('Usuario obligatorio y contraseña de al menos 8 caracteres.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.adminService
      .createTenantMember(id, {
        username: this.form.username.trim().toLowerCase(),
        password: this.form.password,
        name: this.form.name.trim(),
        surname: this.form.surname.trim(),
        email: this.form.email.trim(),
        role_level: this.form.role,
        permissions: this.selectedPermKeys(),
      })
      .pipe(
        catchError((err: unknown) => {
          this.error.set(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => {
        this.form.username = '';
        this.form.password = '';
        this.form.name = '';
        this.form.surname = '';
        this.form.email = '';
        this.form.perms = {};
        this.loadMembers();
      });
  }

  protected onSearchChange(value: string): void {
    this.search.set(value);
    const q = value.trim();
    if (q.length < 2) {
      this.results.set([]);
      return;
    }
    this.adminService
      .listPlatformUsers(q)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo buscar usuarios.');
          return EMPTY;
        }),
      )
      .subscribe((users) => this.results.set(users));
  }

  protected toggleAttachPerm(key: string): void {
    const next = new Set(this.attachPerms());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.attachPerms.set(next);
  }

  protected attachExisting(user: PlatformUser): void {
    const id = this.tenantId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.adminService
      .createTenantMember(id, {
        user_id: user.id,
        role_level: this.attachRole,
        permissions: [...this.attachPerms()],
      })
      .pipe(
        catchError((err: unknown) => {
          this.error.set(err instanceof Error ? err.message : 'No se pudo agregar el usuario.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => {
        this.results.set([]);
        this.search.set('');
        this.attachPerms.set(new Set());
        this.loadMembers();
      });
  }

  // ─── Filas ──────────────────────────────────────────────────

  protected onRoleChange(member: TenantMember, roleLevel: number): void {
    const id = this.tenantId();
    if (!id) return;
    this.adminService
      .updateTenantMemberRole(id, member.id, roleLevel)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo cambiar el rol.');
          this.loadMembers();
          return EMPTY;
        }),
      )
      .subscribe(() => {
        this.members.update((list) =>
          list.map((m) =>
            m.id === member.id
              ? { ...m, role_level: roleLevel, role_name: this.roleName(roleLevel) }
              : m,
          ),
        );
      });
  }

  protected roleName(level: number): string {
    return this.roleOptions.find((r) => r.value === level)?.label.split(' ')[0] ?? 'USER';
  }

  protected toggleEditPerms(member: TenantMember): void {
    if (this.editingPerms() === member.id) {
      this.editingPerms.set(null);
      return;
    }
    this.editPerms.set(new Set(member.permissions));
    this.editingPerms.set(member.id);
  }

  protected toggleEditPerm(key: string): void {
    const next = new Set(this.editPerms());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.editPerms.set(next);
  }

  protected savePerms(member: TenantMember): void {
    const id = this.tenantId();
    if (!id) return;
    this.saving.set(true);
    this.error.set('');
    this.adminService
      .updateTenantMemberPermissions(id, member.id, [...this.editPerms()])
      .pipe(
        catchError(() => {
          this.error.set('No se pudieron guardar los permisos.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => {
        this.members.update((list) =>
          list.map((m) => (m.id === member.id ? { ...m, permissions: [...this.editPerms()] } : m)),
        );
        this.editingPerms.set(null);
      });
  }

  protected remove(member: TenantMember): void {
    const id = this.tenantId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.adminService
      .removeTenantMember(id, member.id)
      .pipe(
        catchError(() => {
          this.error.set('No se pudo quitar al usuario del tenant.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
      )
      .subscribe(() => this.loadMembers());
  }
}
