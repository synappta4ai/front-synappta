# FrontSynapta

Front de la plataforma **Synapta**: agencia creativa multi-tenant con
**eventos → programas → piezas → generaciones** (video, imagen, texto, audio),
studio de generación, biblioteca de recursos con ingredientes tipados
(Personaje / Ubicación / Props) y consola admin.

## Stack

- **Angular 22** (`^22.1.6`) standalone + SSR, TypeScript estricto, signals.
- **PrimeNG 21.1.10** (tema oscuro; componentes standalone por import).
- **Tailwind CSS v4** (utilities en templates + tokens en `src/styles.css`).
- Deploy: Netlify (`@netlify/angular-runtime`, handler en `src/server.ts`).

## Arranque

```bash
npm install
npm start            # ng serve con SSR → http://localhost:4200
```

El API al que habla se define en `src/environments/environment.ts`
(`API_URL`). En desarrollo local: `http://localhost:8099/api/v1`
(back-synapta; ver `../back-synapta/README.md`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Dev server con SSR (`ng serve`) |
| `npm run build` | Build producción (SSR) |
| `npm run build:dev` | Build configuración `dev` |
| `npm test` | Unit tests (Vitest, jsdom) |
| `npm run test:e2e` | E2E con Playwright |
| `npm run serve:ssr:front-synapta` | Servir el build SSR |

Los `pre*` scripts generan `environment.ts` desde `scripts/generate-env.ts`.

## Módulos (`src/app/modules/`)

- `agency` — generación (video/imagen/texto), logs con costo del proveedor
  (créditos + USD), catálogo de modelos (`api` vs `downloaded`).
- `studio` — el studio: prompt, referencias de biblioteca, cola de
  generaciones en vivo, take reel con historial por día, rating excluyente
  (buena toma / elegida final), reuso de requests.
- `projects` — proyectos con generaciones (rating, reuso) y recursos
  asignados (picker, filtro por tipo con contadores, etiqueta de ingrediente).
- `library` — biblioteca de recursos; secciones de referencia
  (`ASSET_SECTIONS` en `interfaces/library.interface.ts`) + ingredientes.
- `admin` — logs (server communications con gasto), imágenes, tenants,
  usuarios y permisos.
- `events` — proyectos/programas/piezas.

## Convenciones y gotchas (leer antes de tocar UI)

- Guía completa para agentes: [`AGENTS.md`](AGENTS.md).
- **Iconos**: subset local Material Icons con mapping manual `.md-*` en
  `styles.css`. Verificar con `grep "md-<nombre>" src/styles.css` antes de
  usar un icono nuevo (no existe el set completo).
- **PrimeNG**: `p-tabs` estilar con `class` directo (`styleClass` no aplica en
  algunas versiones); `p-selectbutton` renderiza cada opción como
  `p-togglebutton`; `p-datepicker` rompe SSR (NG0502); no existe `Boolean` en
  templates (TS2339).
- **Build junto a `ng serve`**: usar `NG_BUILD_CACHE=0 npx ng build
  --configuration development` — correr el build sin esto envenena
  `.angular/cache`. Si `ng serve` sirve template viejo: reiniciarlo.
- Login E2E: `POST /api/v1/auth/login-tenant` con credenciales de
  `.env.e2e` (el password contiene un en-dash U+2013: con curl falla el
  encoding, usar Node/fetch).
