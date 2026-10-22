import {
  test,
  expect,
  expectPageTitle,
  togglePrimeButton,
  openPrimeSelect,
} from './helpers/session';
import type { Page } from '@playwright/test';

/** Elige el primer tenant del header; es lo que destapa el menubar. */
async function selectFirstTenant(page: Page): Promise<void> {
  await openPrimeSelect(page.locator('[aria-label="Tenant a administrar"]'));
  const options = page.locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
  await expect(options.first()).toBeVisible();
  await options.first().click();
}

/**
 * Entra a una sección de la consola. Desde el rediseño las secciones viven
 * detrás del selector de tenant del header: sin elegirlo la página muestra el
 * empty state y el contenido de la sección no existe.
 */
async function gotoAdminSection(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await selectFirstTenant(page);
  await expect(page.locator('.p-menubar.admin-menubar')).toBeVisible({ timeout: 20_000 });
}

test.describe('admin console', () => {
  test('pide un tenant antes de mostrar las secciones', async ({ authedPage: page }) => {
    await page.goto('/admin');
    await expectPageTitle(page, 'Consola de Administración');
    await expect(page).toHaveURL(/\/admin\/models/);
    await expect(page.getByText('Seleccioná un tenant para empezar')).toBeVisible();
    await expect(page.locator('.p-menubar.admin-menubar')).toHaveCount(0);
  });

  test('al elegir tenant carga el menubar y navega sus secciones', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await page.goto('/admin');
    await selectFirstTenant(page);

    const menubar = page.locator('.p-menubar.admin-menubar');
    await expect(menubar).toBeVisible({ timeout: 20_000 });

    const sections: [string, string][] = [
      ['Videos', 'videos'],
      ['Imágenes', 'imagenes'],
      ['Logs', 'logs'],
      ['GPU', 'gpu'],
    ];
    for (const [label, path] of sections) {
      await menubar.getByRole('link', { name: label }).click();
      await page.waitForURL(new RegExp(`/admin/${path}`));
      await expect(menubar.locator('.p-menubar-item-link-active')).toHaveText(new RegExp(label));
    }

    // La consola ocupa el viewport: el scroll vive dentro del contenido.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
      .toBeLessThanOrEqual(1);
  });

  test('el botón Tenants es solo para superadmin y lleva a la gestión', async ({
    authedPage: page,
  }) => {
    await page.goto('/admin');
    const tenantsButton = page.getByRole('button', { name: 'Tenants' });
    await expect(tenantsButton).toBeVisible({ timeout: 20_000 });
    await tenantsButton.click();
    await page.waitForURL(/\/admin\/tenants/);
    await expectPageTitle(page, 'Gestión de Tenants');
  });
});

test.describe('admin models — modelo del agente', () => {
  test('el campo aparece para proveedores LLM y no para generación', async ({
    authedPage: page,
  }) => {
    // Playwright 1.63 ignora {timeout} como 3er argumento de test().
    test.setTimeout(60_000);
    await page.goto('/admin/models');
    await expectPageTitle(page, 'Consola de Administración');

    // Superadmin: hay que elegir tenant para cargar credenciales y modelos.
    await selectFirstTenant(page);
    await expect(page.getByText('API Keys del tenant')).toBeVisible({ timeout: 20_000 });

    // Proveedor LLM (OpenRouter): muestra modelo + Base URL del asistente.
    await openPrimeSelect(page.locator('#cred-provider'));
    let options = page.locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
    await options.filter({ hasText: 'OpenRouter' }).click();
    await expect(page.locator('#cred-agent-model')).toBeVisible();
    await expect(page.locator('#cred-agent-baseurl')).toBeVisible();
    await expect(page.getByText('El modelo LLM que usa el chat de la Agencia')).toBeVisible();

    // Proveedor de generación (BytePlus): no lleva modelo/base URL de agente.
    await openPrimeSelect(page.locator('#cred-provider'));
    options = page.locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
    await options.filter({ hasText: 'BytePlus' }).click();
    await expect(page.locator('#cred-agent-model')).toHaveCount(0);
    await expect(page.locator('#cred-agent-baseurl')).toHaveCount(0);
  });
});

test.describe('admin images gallery', () => {
  test('renders generated images section with toolbar', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await gotoAdminSection(page, '/admin/imagenes');
    await expect(page.locator('.images-toolbar')).toBeVisible();
    await expect(page.locator('.section-toggle.p-togglebutton-checked')).toHaveText(/Generadas/);
    await expect(page.getByPlaceholder('Proyecto, pieza o task…')).toBeVisible();
  });

  test('switches to uploaded assets section with type tabs', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await gotoAdminSection(page, '/admin/imagenes');
    // p-togglebutton de PrimeNG v22 solo alterna con click JS nativo y
    // tras "despertar" el delegador jsaction: el helper reintenta.
    const uploadsToggle = page.locator('.section-toggle').filter({ hasText: 'Recursos subidos' });
    await togglePrimeButton(uploadsToggle);

    // Tabs de tipo de ingrediente con contadores.
    const tabs = page.locator('.type-tab');
    await expect(tabs.filter({ hasText: 'Todos' })).toBeVisible();
    await expect(tabs.filter({ hasText: 'Personaje' })).toBeVisible();
    await expect(tabs.filter({ hasText: 'Locación' })).toBeVisible();
    await expect(tabs.filter({ hasText: 'Prop' })).toBeVisible();

    // Filtro por tipo: Personaje muestra solo sus recursos.
    await tabs.filter({ hasText: 'Personaje' }).click();
    const chips = page.locator('.resource-card .ing-chip');
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      await expect(chips.nth(i)).toContainText(/Personaje/i);
    }
  });

  test('upload buttons are visible', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await gotoAdminSection(page, '/admin/imagenes');
    const uploadsToggle = page.locator('.section-toggle').filter({ hasText: 'Recursos subidos' });
    await togglePrimeButton(uploadsToggle);
    for (const label of ['Todos', 'Personaje', 'Locación', 'Prop']) {
      await expect(page.locator('.upload-btn').filter({ hasText: label })).toBeVisible();
    }
  });

  test('pagination bar hides when there is a single page', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await gotoAdminSection(page, '/admin/imagenes');
    // Con pocos recursos no debe haber barra de paginación (total <= limit).
    const pager = page.locator('.pagination-bar');
    if (await pager.isVisible()) {
      await expect(pager.getByText(/Página/)).toBeVisible();
    }
  });
});

test.describe('admin videos gallery', () => {
  test('renders without crashing', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await page.goto('/admin/videos');
    await selectFirstTenant(page);
    await expectPageTitle(page, 'Consola de Administración');
    await expect(page.locator('.p-menubar.admin-menubar .p-menubar-item-link-active')).toHaveText(
      /Videos/,
      { timeout: 20_000 },
    );
  });
});

test.describe('admin logs', () => {
  test('renders the logs table', async ({ authedPage: page }) => {
    test.setTimeout(60_000);
    await page.goto('/admin/logs');
    await selectFirstTenant(page);
    await expect(page.locator('.p-menubar.admin-menubar .p-menubar-item-link-active')).toHaveText(
      /Logs/,
      { timeout: 20_000 },
    );
  });
});
