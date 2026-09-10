# User Session Store

Store de autenticación y sesión de usuario usando NgRx SignalStore con persistencia en IndexedDB.

## Instalación

El store ya está configurado y disponible en `@store/*`:

```typescript
import { UserSessionStore } from '@store/user.session';
```

## Configuración de Persistencia

### IndexedDB (por defecto)

```typescript
// Ya configurado por defecto
// Database: aura-pos-db
// Store: synapta-store
// Key: aura-pos-auth
```

### LocalStorage (opcional)

```typescript
import { setStorageConfig } from '@store/user.session';

// Configurar antes de inyectar el store
setStorageConfig({ type: 'localStorage' });
```

## Uso en Componentes

### Inicialización

Debes llamar `init()` al iniciar la aplicación (ej. en `AppComponent`):

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { UserSessionStore } from '@store/user.session';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent implements OnInit {
  private sessionStore = inject(UserSessionStore);

  async ngOnInit(): Promise<void> {
    await this.sessionStore.init();
  }
}
```

### Iniciar sesión

```typescript
import { Component, inject } from '@angular/core';
import { UserSessionStore } from '@store/user.session';
import { User } from '@core/interfaces/user.interface';

@Component({
  selector: 'app-login',
  standalone: true,
  template: ` <button (click)="login()">Iniciar sesión</button> `,
})
export class LoginComponent {
  private sessionStore = inject(UserSessionStore);

  async login(): Promise<void> {
    const user: User = {
      id: '1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      modules: ['sales', 'inventory', 'customers', 'reports'],
    };

    await this.sessionStore.login(user, 'jwt-token-here');
  }
}
```

### Cerrar sesión

```typescript
async logout(): Promise<void> {
  await this.sessionStore.logout();
}
```

### Obtener datos del usuario

```typescript
// Señales de solo lectura
const isLoggedIn = this.sessionStore.isLoggedIn();
const currentUser = this.sessionStore.currentUser();
const getToken = this.sessionStore.userToken();
const getModules = this.sessionStore.userModules();
const getRole = this.sessionStore.userRole();
```

### Verificar permisos

```typescript
// Verificar si tiene un módulo
if (this.sessionStore.hasModule('sales')) {
  // mostrar módulo de ventas
}

// Verificar permisos específicos
if (this.sessionStore.hasPermission('products.create')) {
  // permitir crear productos
}
```

### Actualizar token

```typescript
async onTokenRefresh(newToken: string): Promise<void> {
  await this.sessionStore.updateToken(newToken);
}
```

### Actualizar usuario

```typescript
async updateProfile(updates: Partial<User>): Promise<void> {
  await this.sessionStore.updateUser({
    name: 'Nuevo nombre',
    avatar: 'nuevo-avatar.png',
  });
}
```

### Sincronizar estado

```typescript
// Forzar lectura desde storage
await this.sessionStore.syncState();
```

## Estado del Store

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

## Modelo de Usuario

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  modules: string[];
  avatar?: string;
  permissions?: string[];
}
```

## Uso en Guards

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserSessionStore } from '@store/user.session';

export const authGuard: CanActivateFn = () => {
  const sessionStore = inject(UserSessionStore);
  const router = inject(Router);

  if (sessionStore.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
```

## Uso en Interceptores

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { UserSessionStore } from '@store/user.session';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionStore = inject(UserSessionStore);
  const token = sessionStore.userToken();

  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `${token}`,
      },
    });
    return next(authReq);
  }

  return next(req);
};
```

## Configuración del Storage Service

El `StorageService` soporta configuración personalizada:

```typescript
import { StorageService } from '@core/services/storage.service';

// Configuración personalizada
const config = {
  type: 'indexedDB' as const,
  dbName: 'my-custom-db',
  storeName: 'auth-store',
};
```

Métodos disponibles:

- `getItem<T>(key, config)` - Obtener valor
- `setItem<T>(key, value, config)` - Guardar valor
- `removeItem(key, config)` - Eliminar valor
- `clearAll(config)` - Limpiar todo
