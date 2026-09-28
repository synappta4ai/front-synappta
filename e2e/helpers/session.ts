import { test as base, expect, type Page } from '@playwright/test';

/**
 * Credenciales del entorno local (variables E2E_USER / E2E_PASSWORD; el
 * password local contiene un en-dash U+2013 — escribirlo en .env, no acá).
 */
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8099/api/v1';
const TEST_USER = {
  username: process.env.E2E_USER ?? 'superadmin',
  password: process.env.E2E_PASSWORD ?? '',
};

/** Usuario sintético devuelto por /auth/login (User del front). */
interface LoginUser {
  id: number;
  username: string;
  name: string;
  surname: string;
  user_name: string;
  email: string;
  role_level: number;
  role_name: string;
  active: boolean;
}

interface LoginResponse {
  data: { user: LoginUser; token: string; tenant_id: number };
  success: boolean;
}

/** Login directo por API (evita la UI y es reutilizable entre workers). */
export async function apiLogin(): Promise<LoginResponse['data']> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });
  if (!response.ok) {
    throw new Error(`API login failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as LoginResponse;
  if (!body.success || !body.data?.token) {
    throw new Error(`API login rejected: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data;
}

/**
 * Escribe la sesión en IndexedDB (Synapta-V2 / synapta-store), misma clave y
 * shape que usa el UserSessionStore del front (AUTH_STORAGE_KEY='synapta-auth').
 * Debe ejecutarse ANTES de navegar a rutas privadas: el authGuard espera la
 * hidratación y decide con este estado.
 */
export async function seedSession(page: Page): Promise<void> {
  const { user, token, tenant_id } = await apiLogin();
  await page.addInitScript(
    ({ user, token, tenantId }) => {
      const openRequest = indexedDB.open('Synapta-V2', 1);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains('synapta-store')) {
          db.createObjectStore('synapta-store', { keyPath: 'key' });
        }
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction(['synapta-store'], 'readwrite');
        const store = tx.objectStore('synapta-store');
        store.put({
          key: 'synapta-auth',
          value: {
            user,
            token,
            tenantId,
            isAuthenticated: true,
            isLoading: false,
            isHydrated: true,
            isHydrating: false,
          },
        });
      };
    },
    { user, token, tenantId: tenant_id },
  );
}

/** Espera la hidratación de Angular (patrón del auth.spec existente). */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('Angular hydrated'),
    timeout: 20_000,
  });
}

/**
 * Fixture base: página con sesión sembrada + hidratación esperada.
 * Uso: test.extend({ authedPage }) con `authedPage.goto('/ruta')`.
 */
export type SessionFixtures = {
  authedPage: Page;
};

export const test = base.extend<SessionFixtures>({
  authedPage: async ({ page }, use) => {
    await seedSession(page);
    await page.goto('/');
    await waitForHydration(page);
    await use(page);
  },
});

export { expect };

/** Aserción de título de página (PageContainer renderiza un h1). */
export async function expectPageTitle(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
}

/**
 * Alterna un p-togglebutton de PrimeNG v22. El primer evento JS solo
 * "despierta" el delegador jsaction; el click nativo alterna a partir del
 * siguiente. Reintenta con polling hasta ver la clase checked.
 */
export async function togglePrimeButton(button: ReturnType<Page['locator']>): Promise<void> {
  const alreadyChecked = ((await button.getAttribute('class')) ?? '').includes(
    'p-togglebutton-checked',
  );
  if (!alreadyChecked) {
    // Dispara clicks nativos hasta que el delegador reaccione.
    await expect
      .poll(
        async () => {
          await button.evaluate((el) => (el as HTMLElement).click());
          await button.waitFor({ state: 'attached', timeout: 250 }).catch(() => undefined);
          return ((await button.getAttribute('class')) ?? '').includes('p-togglebutton-checked');
        },
        { timeout: 10_000, intervals: [300, 500, 1_000] },
      )
      .toBe(true);
  }
  await expect(button).toHaveClass(/p-togglebutton-checked/);
}

/**
 * Abre el overlay de un p-select de PrimeNG. El click de Playwright abre el
 * overlay solo cuando los handlers ya se registraron tras la hidratación;
 * reintenta hasta ver el overlay visible.
 */
export async function openPrimeSelect(select: ReturnType<Page['locator']>): Promise<void> {
  const overlay = page_overlayFor(select);
  for (let i = 0; i < 3; i++) {
    await select.click();
    const opened = await overlay
      .first()
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      return;
    }
  }
  throw new Error('p-select overlay did not open after retries');
}

/** Overlay asociado al último select clickeado (los overlays viven en body). */
function page_overlayFor(_select: ReturnType<Page['locator']>) {
  // Los overlays de PrimeNG se montan en el body; cualquiera no oculto sirve.
  return _select.page().locator('.p-select-overlay:not(.p-select-overlay-hidden)');
}
