# AGENTS.md

Instrucciones para agentes de IA que trabajan en este repositorio. Léelas antes de tocar código.

## Proyecto

- **Stack:** Angular 21 + TypeScript en modo estricto, componentes standalone, SSR (App Engine).
- **Despliegue:** Netlify vía `@netlify/angular-runtime` (el `src/server.ts` es el handler).
- **Estilos:** Tailwind CSS v4 (utilities en templates, estilos globales en `src/styles.css`).
- **Testing:** Vitest con `@angular/build:unit-test` (entorno `jsdom`).
- **Formato:** Prettier. Package manager: `npm` (npm@11).

## Comandos

| Comando                  | Descripción                                 |
| ------------------------ | ------------------------------------------- |
| `npm start`              | Servidor de desarrollo con SSR (`ng serve`) |
| `npm run build`          | Build de producción (SSR)                   |
| `npm run build:dev`      | Build con configuración `dev` (SSR)         |
| `npm test`               | Tests unitarios (Vitest)                    |
| `npx prettier --write .` | Formatear todo el proyecto                  |

> Antes de dar una tarea por terminada, corre `npm run build` y `npm test`. Si no pasan, no está terminada.

## TypeScript

- `strict` está activado en `tsconfig.json` (`strictTemplates`, `strictInjectionParameters`, etc.). El código nuevo debe cumplirlo.
- Preferir inferencia de tipos cuando sea obvia.
- Prohibido el tipo `any`; usar `unknown` cuando el tipo es incierto.
- Preferir `readonly` en properties y arrays que no mutan.

## Angular

- Componentes **standalone**. No se escribe `standalone: true` en el decorator: es el default en Angular 20+.
- No usar NgModules nuevos; la app es standalone.
- Estado con **señales**: `signal`, `computed()`, `input()`, `output()`. No usar decoradores `@Input`/`@Output`.
- `changeDetection: ChangeDetectionStrategy.OnPush` en todo `@Component`.
- No usar `@HostBinding`/`@HostListener`: declarar las host bindings en el objeto `host` del decorator.
- `NgOptimizedImage` para imágenes estáticas (no funciona con imágenes base64 inline).
- Formularios **reactivos** de preferencia.
- No usar `ngClass`/`ngStyle`: usar bindings `[class]` y `[style]`.
- Rutas con **lazy loading** (`loadChildren`/`loadComponent`) por módulo. No importar componentes de feature directamente en `app.routes.ts`.
- En templates usar control de flujo nativo (`@if`, `@for`, `@switch`) con `track` en `@for`; nunca `*ngIf`/`*ngFor`/`*ngSwitch`.
- No asumir globals en templates (ej. `new Date()`, `Math`): exponerlos desde el componente.

## Accesibilidad

- Pasar AXE sin errores y cumplir WCAG AA (foco, contraste, roles y ARIA).
- Un `<label>` asociado por campo de formulario, con `aria-invalid`/`aria-describedby` cuando haya errores de validación.

## Estado

- Señales para estado local de componente; `computed()` para estado derivado; transformaciones puras y predecibles.
- Para mutar señales usar `set()`/`update()`. **Prohibido** `.mutate()`.

## Servicios

- Una sola responsabilidad por servicio, `providedIn: 'root'`.
- Usar `inject()` (función), nunca inyección por constructor.
- Separación de capas:
  - **Service**: capa de negocio. Orquesta repos, transforma datos y expone a los componentes.
  - **API Repository**: única capa que toca `HttpClient` y conoce la URL del backend.
- Los componentes **nunca** inyectan un repository directamente; siempre a través del service.

## Environments

- Tres ambientes definidos por `fileReplacements` en `angular.json`:
  - **local** — configuración `development` (`ng serve`) → `src/environments/environment.ts`
  - **dev** — configuración `dev` (`npm run build:dev`) → `src/environments/environment.dev.ts`
  - **prod** — configuración `production` (`npm run build`) → `src/environments/environment.prod.ts`
- Importarlos siempre con el alias `@env/environment` (nunca con rutas relativas).
- La API base se lee de `environment.apiUrl` en los API repositories.

## SSR / Netlify

- No usar `window`, `document` ni `navigator` en código server-side. Usar el token `DOCUMENT` de `@angular/platform-server`.
- El SSR se despliega en Netlify con `@netlify/angular-runtime`; `src/server.ts` expone el handler de App Engine. No cambiarlo a otro runtime sin actualizar el deploy.
- Con SSR, las páginas renderizadas no pasan por los redirects de `netlify.toml`. Usar Angular Router (`redirectTo`) para los redirects de la app.

## Arquitectura de módulos

Cada feature vive en `src/app/modules/{moduleName}/` con esta estructura:

```
src/app/modules/{moduleName}/
├── {moduleName}.routes.ts
├── interfaces/
│   ├── {moduleName}.interface.ts
│   └── index.ts
├── repositories/
│   ├── {moduleName}-api.repository.ts
│   └── index.ts
├── services/
│   ├── {moduleName}.service.ts
│   └── index.ts
└── ui/
    └── {feature}/
        ├── {feature}.component.ts
        └── {feature}.component.html
```

Reglas de barrels (`index.ts`):

- `interfaces/index.ts` — exporta todos los interfaces de la feature con `export * from ...`.
- `services/index.ts` — exporta solo el business service, **nunca** el API repository.
- `repositories/index.ts` — exporta el API repository (opcional, solo si se necesita acceso directo).
- `ui/` organiza las sub-secciones visuales de las features.

Ejemplo:

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: 'agency',
    loadChildren: () => import('@modules/agency/agency.routes').then((m) => m.agencyRoutes),
  },
];

// modules/agency/interfaces/index.ts
export * from './agency.interface';

// modules/agency/services/index.ts
export * from './agency.service';

// modules/agency/repositories/index.ts
export * from './agency-api.repository';
```

## Core y Shared

Código transversal que NO pertenece a una feature concreta:

**Core structure:**

```
src/app/core/
├── constants/       # App constants (@constants/*)
├── enums/           # Enumerations (@enums/*)
├── guards/          # Route guards (@guards/*)
├── interceptors/    # HTTP interceptors (@interceptors/*)
├── interfaces/      # TypeScript interfaces (@interfaces/*)
├── pipes/           # Custom pipes (@pipes/*)
├── repositories/    # Repository implementations (@repositories/*)
└── services/        # Global services (@services/*)
```

**Shared structure:**

```
src/app/shared/
├── components/      # Shared UI components (@shared/components/*)
├── services/        # Shared services (@shared/services/*)
└── utils/           # Shared utilities (@shared/utils/*, @utils/*)
```

Reglas:

- `core/` y `shared/` no importan nunca desde `modules/`. Solo los `modules/` importan de `core/` y `shared/`.
- Imports cross-cutting con aliases de `tsconfig.json` (`@modules/*`, `@constants/*`, `@enums/*`, `@guards/*`, `@interceptors/*`, `@interfaces/*`, `@pipes/*`, `@repositories/*`, `@services/*`, `@shared/components/*`, `@shared/services/*`, `@shared/utils/*`, `@env/*`). Nunca rutas relativas hacia `core/`, `shared/` o `environments/`.
- En `core/` y `shared/` también aplican los barrels (`index.ts`) para publicar lo que se consume desde fuera.

## Testing

- Tests con Vitest, colocated como `*.spec.ts` junto al archivo que prueban.
- Para tests de repos usar `provideHttpClientTesting()` y `HttpTestingController`.
- Para tests de components que consumen `HttpClient`, usar `provideHttpClient()` (o el mock del service).

## Estilos

- Tailwind CSS v4: utilities en los templates. No inventar colores arbitrarios fuera de la paleta sin justificación.
- No usar `ngStyle` para estilos dinámicos simples; usar bindings `[style]` o clases condicionales con `[class]`.

## Buenas prácticas generales

- Componentes pequeños y con una sola responsabilidad.
- Nombres: kebab-case para archivos, PascalCase para clases/interfaces, camelCase para variables y funciones.
- Imports relativos dentro de cada módulo; `app.routes.ts` y los archivos cross-layer usan los aliases de tsconfig (`@modules/*`, `@shared/*`, etc.), no rutas relativas hacia `core/`, `shared/` o `environments/`.
- No agregar comentarios innecesarios; el código debe ser autoexplicativo.
