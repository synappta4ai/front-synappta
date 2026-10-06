import { test, expect, expectPageTitle, openPrimeSelect } from './helpers/session';

test.describe('agency', () => {
  test('renders the production flow page', async ({ authedPage: page }) => {
    await page.goto('/agency');
    await expectPageTitle(page, 'Agencia · Flujo de Producción');
  });
});

test.describe('studio', () => {
  test('renders prompt panel and mode switch', async ({ authedPage: page }) => {
    await page.goto('/studio');
    // "AGREGÁ TU PROMPT" es placeholder del textarea del prompt.
    await expect(page.getByPlaceholder('AGREGÁ TU PROMPT')).toBeVisible();
    await expect(page.getByPlaceholder('Negative prompt (opcional)')).toBeVisible();
    await expect(page.locator('.studio-mode')).toBeVisible();
    await expect(page.getByRole('button', { name: /Referencias/ })).toBeVisible();
  });

  test('shows model selector with Higgsfield entries', async ({ authedPage: page }) => {
    await page.goto('/studio');
    // El combobox del modelo está junto al texto "Modelo" (col. derecha).
    const modelSelect = page.getByRole('combobox', { name: 'Elegí el modelo de generación' });
    await expect(modelSelect).toBeVisible();
    // El click normal de Playwright abre el overlay del p-select
    // (reintenta hasta que los handlers jsaction están registrados).
    await openPrimeSelect(modelSelect);
    const options = page.locator(
      '.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option',
    );
    await expect(options.first()).toBeVisible();
    await expect(options.filter({ hasText: 'Kling 3.0 Turbo' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Seedance 2.5' }).first()).toBeVisible();
  });
});

// /video y /events quedaron comentadas en app.routes.ts: el wildcard las
// redirige a /agency. Estos tests documentan ese retiro.
test.describe('rutas retiradas', () => {
  test('/video redirige a /agency', async ({ authedPage: page }) => {
    await page.goto('/video');
    await page.waitForURL(/\/agency$/);
    await expect(page).toHaveURL(/\/agency$/);
  });

  test('/events redirige a /agency', async ({ authedPage: page }) => {
    await page.goto('/events');
    await page.waitForURL(/\/agency$/);
    await expect(page).toHaveURL(/\/agency$/);
  });

  test('/events/manage redirige a /agency', async ({ authedPage: page }) => {
    await page.goto('/events/manage');
    await page.waitForURL(/\/agency$/);
    await expect(page).toHaveURL(/\/agency$/);
  });
});

test.describe('projects', () => {
  test('renders the projects page', async ({ authedPage: page }) => {
    await page.goto('/projects');
    // El h1 de página y un h2 de sección comparten texto: usar level=1.
    await expect(
      page.getByRole('heading', { name: 'Proyectos', exact: true, level: 1 }),
    ).toBeVisible();
  });
});

test.describe('auth guard', () => {
  test('redirects anonymous users from private routes to login', async ({ page }) => {
    await page.goto('/studio');
    await page.waitForURL(/\/auth\/login/);
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
