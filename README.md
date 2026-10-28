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

## Tiempo real (WebSocket)

La URL del socket se define en `SOCKET_URL` de los environments. El
servidor vive en `../socket` (Go + Echo + Gorilla WebSocket) y expone:

- **Chat por salas**: `GET /ws?id=<id>&room=<room>` — el cliente envía
  `{ sender, content }` y recibe `{ sender, content, dateTime }`
  (broadcast a la sala).
- **REST fallback**: `POST /rest-sw?room=<room>` con el mismo body.
- **Monitor**: `GET /monitor?role=provider|viewer&id=<id>&monitorId=<id>`
  — el proveedor envía `{ data }`; el visor recibe
  `{ type, providerId, data, timestamp }` (`full_state`, `update`,
  `connect`, `disconnect`).

Cliente: `SocketService` en `src/app/core/services/socket.service.ts`.
Es un servicio base **genérico** sobre el que se construyen los canales
concretos (chat/monitor). Expone señales `status`, `messages`,
`lastMessage` e `isConnected`, y los métodos `connect(options)`,
`send(payload)`, `close()` y `clearMessages()`. Es SSR-safe (no-op en
server) y soporta reconexión opcional (`reconnect`, `reconnectDelayMs`,
`maxReconnectAttempts`).

```ts
const socket = inject(SocketService);
socket.connect({
  path: '/ws',
  query: { id: userId, room: 'strategy-rom' },
  reconnect: true,
});
socket.send({ sender: userId, content: 'Hola' });
```

## Comandos

| Comando                           | Qué hace                        |
| --------------------------------- | ------------------------------- |
| `npm start`                       | Dev server con SSR (`ng serve`) |
| `npm run build`                   | Build producción (SSR)          |
| `npm run build:dev`               | Build configuración `dev`       |
| `npm test`                        | Unit tests (Vitest, jsdom)      |
| `npm run test:e2e`                | E2E con Playwright              |
| `npm run serve:ssr:front-synapta` | Servir el build SSR             |

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
