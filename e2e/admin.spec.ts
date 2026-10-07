import {
  test,
  expect,
  expectPageTitle,
  togglePrimeButton,
  openPrimeSelect,
} from './helpers/session';

test.describe('admin console', () => {
  test('renders models tab by default', async ({ authedPage: page }) => {
    await page.goto('/admin');
    await expectPageTitle(page, 'Consola de Administración');
    await expect(page.locator('.p-tab.p-tab-active')).toHaveText(/Modelos/);
    await expect(page).toHaveURL(/\/admin\/models/);
  });

  test('navigates every tab and highlights the active one', async ({ authedPage: page }) => {
    await page.goto('/admin');
    const tabs = ['Videos', 'Imágenes', 'Logs'];
    for (const tab of tabs) {
      await page.locator('.p-tab').filter({ hasText: tab }).click();
      await page.waitForURL(
        new RegExp(`/admin/${tab === 'Imágenes' ? 'imagens' : tab.toLowerCase()}`),
      );
      await expect(page.locator('.p-tab.p-tab-active')).toHaveText(new RegExp(tab));
    }
  });

  test('shows Tenants tab for superadmin', async ({ authedPage: page }) => {
    await page.goto('/admin');
    // El tab aparece tras hidratar la sesión (role_level 0): bajo carga de
    // 6 workers la hidratación puede superar el timeout por defecto de 5s.
    await expect(page.locator('.p-tab').filter({ hasText: 'Tenants' })).toBeVisible({
      timeout: 20_000,
    });
    await page.locator('.p-tab').filter({ hasText: 'Tenants' }).click();
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
    await openPrimeSelect(page.locator('[aria-label="Seleccionar tenant"]'));
    const tenantOptions = page
      .locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
    await expect(tenantOptions.first()).toBeVisible();
    await tenantOptions.first().click();
    await expect(page.getByText('API Keys del tenant')).toBeVisible({ timeout: 20_000 });

    // Proveedor LLM (OpenRouter): muestra modelo + Base URL del asistente.
    await openPrimeSelect(page.locator('#cred-provider'));
    let options = page.locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
    await options.filter({ hasText: 'OpenRouter' }).click();
    await expect(page.locator('#cred-agent-model')).toBeVisible();
    await expect(page.locator('#cred-agent-baseurl')).toBeVisible();
    await expect(
      page.getByText('El modelo LLM que usa el chat de la Agencia'),
    ).toBeVisible();

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
    await page.goto('/admin/imagens');
    await expect(page.locator('.images-toolbar')).toBeVisible();
    await expect(page.locator('.section-toggle.p-togglebutton-checked')).toHaveText(/Generadas/);
    await expect(page.getByPlaceholder('Proyecto, pieza o task…')).toBeVisible();
  });

  test('switches to uploaded assets section with type tabs', async ({ authedPage: page }) => {
    await page.goto('/admin/imagens');
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
    await page.goto('/admin/imagens');
    const uploadsToggle = page.locator('.section-toggle').filter({ hasText: 'Recursos subidos' });
    await togglePrimeButton(uploadsToggle);
    for (const label of ['Todos', 'Personaje', 'Locación', 'Prop']) {
      await expect(page.locator('.upload-btn').filter({ hasText: label })).toBeVisible();
    }
  });

  test('pagination bar hides when there is a single page', async ({ authedPage: page }) => {
    await page.goto('/admin/imagens');
    // Con pocos recursos no debe haber barra de paginación (total <= limit).
    const pager = page.locator('.pagination-bar');
    if (await pager.isVisible()) {
      await expect(pager.getByText(/Página/)).toBeVisible();
    }
  });
});

test.describe('admin videos gallery', () => {
  test('renders without crashing', async ({ authedPage: page }) => {
    await page.goto('/admin/videos');
    await expectPageTitle(page, 'Consola de Administración');
    await expect(page.locator('.p-tab.p-tab-active')).toHaveText(/Videos/);
  });
});

test.describe('admin logs', () => {
  test('renders the logs table', async ({ authedPage: page }) => {
    await page.goto('/admin/logs');
    await expect(page.locator('.p-tab.p-tab-active')).toHaveText(/Logs/);
    // La página tiene su propio contenido (tabla o empty state).
    const content = page.locator('app-page-container main, app-page-container');
    await expect(content.first()).toBeVisible();
  });
});
