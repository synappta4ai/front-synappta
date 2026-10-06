import { test, expect, expectPageTitle } from './helpers/session';

/** Meses en español para parsear los encabezados "octubre 4, 2026". */
const ES_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

/** Espera a que la lista termine de cargar (cards o estado vacío). */
async function waitForListReady(
  page: import('@playwright/test').Page,
  cardSelector: string,
  emptyText: string,
): Promise<void> {
  await expect(
    page
      .locator(cardSelector)
      .first()
      .or(page.getByRole('heading', { name: emptyText, exact: true })),
  ).toBeVisible();
}

test.describe('rutas en inglés', () => {
  test('renderiza la biblioteca en /resources', async ({ authedPage: page }) => {
    await page.goto('/resources');
    await expectPageTitle(page, 'Recursos');
    await expect(page.getByRole('button', { name: /\bTodos\b/ })).toBeVisible();
    await waitForListReady(page, '.resource-card', 'No hay recursos');
    // La grilla "Todos" es plana: nunca hay encabezados de sección.
    await expect(page.locator('.asset-section-head')).toHaveCount(0);
  });

  test('renderiza mis generaciones en /my-generations', async ({ authedPage: page }) => {
    await page.goto('/my-generations');
    await expectPageTitle(page, 'Mis generaciones');
    await waitForListReady(page, '.gen-card', 'Todavía no hay generaciones');
  });

  test('la nav linkea las rutas en inglés y no las viejas', async ({ authedPage: page }) => {
    await page.goto('/resources');
    expect(await page.locator('a[href="/resources"]').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('a[href="/my-generations"]').count()).toBeGreaterThanOrEqual(1);
    await expect(
      page.locator('a[href="/recursos"], a[href="/mis-generaciones"]'),
    ).toHaveCount(0);
  });
});

test.describe('redirecciones de rutas antiguas', () => {
  test('/recursos lleva a /resources', async ({ authedPage: page }) => {
    await page.goto('/recursos');
    await page.waitForURL(/\/resources$/);
    await expectPageTitle(page, 'Recursos');
  });

  test('/mis-generaciones lleva a /my-generations', async ({ authedPage: page }) => {
    await page.goto('/mis-generaciones');
    await page.waitForURL(/\/my-generations$/);
    await expectPageTitle(page, 'Mis generaciones');
  });

  test('un anónimo en la ruta vieja cae en el login', async ({ page }) => {
    await page.goto('/recursos');
    await page.waitForURL(/\/auth\/login/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});

test.describe('filtros de la biblioteca', () => {
  test('cada tab filtra la grilla plana a su conteo', async ({ authedPage: page }) => {
    await page.goto('/resources');
    await waitForListReady(page, '.resource-card', 'No hay recursos');

    const cards = page.locator('.resource-card');
    const tabLabels = [
      'Todos',
      'Imágenes',
      'Videos',
      'Audio',
      'Personaje',
      'Ubicación',
      'Props',
      'Otros',
    ];

    for (const label of tabLabels) {
      const tab = page.getByRole('button', { name: new RegExp(`\\b${label}\\b`) });
      await expect(tab).toBeVisible();
      await tab.click();
      const badge = await tab.locator('.count').innerText();
      // La grilla muestra exactamente los items del badge del tab activo…
      await expect(cards).toHaveCount(Number.parseInt(badge, 10));
      // …y sin separación por secciones de tipo.
      await expect(page.locator('.asset-section-head')).toHaveCount(0);
    }
  });

  test('la búsqueda sin resultados muestra el estado vacío y lo limpia', async ({
    authedPage: page,
  }) => {
    await page.goto('/resources');
    await waitForListReady(page, '.resource-card', 'No hay recursos');

    const cards = page.locator('.resource-card');
    const before = await cards.count();
    const search = page.getByLabel('Buscar recursos por nombre');

    await search.fill('zzzz-sin-resultados-zzzz');
    await expect(page.getByRole('heading', { name: 'No hay recursos', exact: true })).toBeVisible();

    await search.fill('');
    if (before > 0) {
      await expect(cards).toHaveCount(before);
    }
    await expect(page.locator('.asset-section-head')).toHaveCount(0);
  });
});

test.describe('agrupación por fecha en mis generaciones', () => {
  test('agrupa las cards bajo encabezados de fecha en orden descendente', async ({
    authedPage: page,
  }) => {
    await page.goto('/my-generations');
    await waitForListReady(page, '.gen-card', 'Todavía no hay generaciones');

    const groups = page.locator('.date-group-head');
    const cards = page.locator('.gen-card');
    if ((await cards.count()) === 0) {
      await expect(groups).toHaveCount(0);
      return;
    }

    // Toda card vive dentro de la grilla de un grupo con encabezado.
    expect(await groups.count()).toBeGreaterThan(0);
    await expect(page.locator('.gen-grid .gen-card')).toHaveCount(await cards.count());

    // Encabezados con formato "octubre 4, 2026" y en orden descendente.
    const dates: number[] = [];
    for (const text of await groups.allInnerTexts()) {
      const match = /([a-záéíóúñ]+) (\d{1,2}), (\d{4})/.exec(text);
      expect(match, `encabezado de fecha inválido: "${text}"`).not.toBeNull();
      const month = ES_MONTHS[match![1].toLowerCase()];
      expect(month, `mes desconocido en: "${text}"`).toBeDefined();
      dates.push(new Date(Number(match![3]), month, Number(match![2])).getTime());
    }
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });
});
