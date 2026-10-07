import {
  test,
  expect,
  expectPageTitle,
  openPrimeSelect,
  waitForHydration,
  apiLogin,
} from './helpers/session';

/** Base del API que usa el front (misma fuente que el helper de sesión). */
const E2E_API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8099/api/v1';

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

test.describe('diálogo Editar elemento', () => {
  /**
   * Abre el diálogo sobre el primer recurso de la grilla.
   *
   * El HTML de SSR llega con el banner de error (el server no tiene token),
   * así que hay que esperar a que el cliente se hidrate y recargue la lista.
   */
  async function openEditor(page: import('@playwright/test').Page) {
    const cards = page.locator('.resource-card');
    let ready = false;
    for (let attempt = 0; attempt < 3 && !ready; attempt++) {
      await page.goto('/resources');
      await waitForHydration(page);
      try {
        await expect
          .poll(
            async () => {
              if ((await cards.count()) > 0) {
                return 'ready';
              }
              // Banner borrado => el cliente terminó: biblioteca vacía de verdad.
              return (await page.locator('p-message').count()) === 0 ? 'empty' : 'loading';
            },
            { timeout: 30_000, intervals: [500, 1_000] },
          )
          .not.toBe('loading');
      } catch {
        // La API no respondió: se reintenta con otra navegación.
        continue;
      }
      ready = (await cards.count()) > 0;
    }
    test.skip(!ready, 'la biblioteca no tiene recursos o la API no respondió');
    await cards.first().click();
    await expect(page.locator('.edit-grid')).toBeVisible();
  }

  test('muestra los dos paneles, los campos y los hints del editor', async ({
    authedPage: page,
  }) => {
    await openEditor(page);

    await expect(page.getByRole('heading', { name: 'Editar elemento' })).toBeVisible();
    // Panel izquierdo: grilla de imágenes + fila de miniaturas con "+".
    await expect(page.locator('.edit-stage .edit-cell').first()).toBeVisible();
    await expect(page.locator('.edit-thumbs .edit-thumb').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Añadir imagen al elemento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recargar imágenes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotar vista previa' })).toBeVisible();

    // Panel derecho: los seis campos del mock.
    await expect(page.locator('#el-category')).toBeVisible();
    await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Versión', { exact: true })).toBeVisible();
    await expect(page.locator('#el-status')).toBeVisible();
    await expect(page.getByLabel('ID del elemento', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Descripción', { exact: true })).toBeVisible();
    await expect(
      page.getByText('El nombre para mostrar, p. ej., Cal, Oli, Elena'),
    ).toBeVisible();
    await expect(page.getByText('Propiedades personalizadas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Añadir propiedad personalizada' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  test('el ID del elemento se regenera desde el Nombre con ↺', async ({ authedPage: page }) => {
    await openEditor(page);
    const name = page.getByLabel('Nombre', { exact: true });
    const idField = page.getByLabel('ID del elemento', { exact: true });

    await name.fill('Cal Oli-Test');
    await page.getByRole('button', { name: 'Regenerar el ID desde el nombre' }).click();
    await expect(idField).toHaveValue('Cal_Oli_Test');
    await expect(page.locator('.edit-grid')).toContainText('@Cal_Oli_Test');
  });

  test('añade y quita propiedades personalizadas', async ({ authedPage: page }) => {
    await openEditor(page);

    await page.getByRole('button', { name: 'Añadir propiedad personalizada' }).click();
    const key = page.getByLabel('Clave de la propiedad 1', { exact: true });
    const value = page.getByLabel('Valor de la propiedad 1', { exact: true });
    await expect(key).toBeVisible();
    await key.fill('color');
    await value.fill('azul');
    await expect(key).toHaveValue('color');

    await page.getByRole('button', { name: 'Quitar la propiedad 1' }).click();
    await expect(key).toHaveCount(0);
  });

  test('elegir categoría y estado refleja la selección', async ({ authedPage: page }) => {
    await openEditor(page);

    await openPrimeSelect(page.locator('#el-category'));
    await page
      .locator('.p-select-overlay:not(.p-select-overlay-hidden) li', { hasText: 'Ubicación' })
      .first()
      .click();
    await expect(page.locator('#el-category')).toContainText('Ubicación');

    await openPrimeSelect(page.locator('#el-status'));
    await page
      .locator('.p-select-overlay:not(.p-select-overlay-hidden) li', { hasText: 'Aprobado' })
      .first()
      .click();
    await expect(page.locator('#el-status')).toContainText('Aprobado');
  });

  test('cancelar cierra el diálogo sin aplicar cambios', async ({ authedPage: page }) => {
    await openEditor(page);
    const name = page.getByLabel('Nombre', { exact: true });
    const original = await name.inputValue();

    await name.fill('Nombre Que No Debe Guardarse');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.edit-grid')).toHaveCount(0);

    await page.locator('.resource-card').first().click();
    await expect(page.locator('.edit-grid')).toBeVisible();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(original);
  });
  test('guarda el elemento con metadata y lo reabre con los datos', async ({
    authedPage: page,
  }) => {
    await openEditor(page);
    const name = `E2E Dialog Element ${Date.now()}`;
    const slug = name.replace(/\s+/g, '_');
    let createdId: string | null = null;
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };

    try {
      await page.getByLabel('Nombre', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Regenerar el ID desde el nombre' }).click();
      await expect(page.getByLabel('ID del elemento', { exact: true })).toHaveValue(slug);
      await page.getByLabel('Versión', { exact: true }).fill('v2');
      await page.getByLabel('Descripción', { exact: true }).fill('Generado por el e2e');
      await page.getByRole('button', { name: 'Añadir propiedad personalizada' }).click();
      await page.getByLabel('Clave de la propiedad 1', { exact: true }).fill('color');
      await page.getByLabel('Valor de la propiedad 1', { exact: true }).fill('azul');
      await openPrimeSelect(page.locator('#el-category'));
      await page
        .locator('.p-select-overlay:not(.p-select-overlay-hidden) li', { hasText: 'Ubicación' })
        .first()
        .click();

      const [saveResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url().includes('/ingredients') &&
            res.request().method() !== 'GET' &&
            !res.url().includes('/files'),
          { timeout: 30_000 },
        ),
        page.getByRole('button', { name: 'Guardar' }).click(),
      ]);
      expect(saveResponse.status()).toBeLessThan(300);
      await expect(page.locator('.viewer-head__sub')).toHaveText(`@${slug}`);

      // El back persistió la metadata del elemento.
      const page1 = await fetch(`${E2E_API_BASE}/ingredients/page?page=1&pageSize=200`, {
        headers: auth,
      }).then((r) => r.json());
      let rows = page1.data?.items ?? [];
      if (rows.length === 0) {
        const all = await fetch(`${E2E_API_BASE}/ingredients`, { headers: auth }).then((r) =>
          r.json(),
        );
        rows = Array.isArray(all.data) ? all.data : (all.data?.items ?? []);
      }
      const found = rows
        .map((row: { ingredient?: unknown }) => row.ingredient ?? row)
        .find((item: { name: string }) => item.name === name);
      expect(found, 'el ingrediente recién creado no aparece en /ingredients').toBeTruthy();
      createdId = found.id;
      const meta = JSON.parse(found.metadata ?? '{}');
      expect(meta.element_id).toBe(`@${slug}`);
      expect(meta.version).toBe('v2');
      expect(meta.props).toEqual({ color: 'azul' });
      expect(found.type).toBe('location');
      expect(found.description).toBe('Generado por el e2e');

      // Reabrir el diálogo: los datos vienen del back.
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.locator('.edit-grid')).toHaveCount(0);
      await page.locator('.resource-card').first().click();
      await expect(page.locator('.edit-grid')).toBeVisible();
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(name);
      await expect(page.getByLabel('Versión', { exact: true })).toHaveValue('v2');
      await expect(page.getByLabel('ID del elemento', { exact: true })).toHaveValue(slug);
      await page.getByRole('button', { name: 'Cancelar' }).click();
    } finally {
      // Limpieza: desvincular el recurso y desactivar el elemento de prueba.
      if (createdId) {
        const detail = await fetch(`${E2E_API_BASE}/ingredients/${createdId}`, {
          headers: auth,
        }).then((r) => r.json());
        for (const file of detail.data?.files ?? []) {
          await fetch(`${E2E_API_BASE}/ingredients/${createdId}/files/${file.file_id}`, {
            method: 'DELETE',
            headers: auth,
          });
        }
        await fetch(`${E2E_API_BASE}/ingredients/${createdId}`, {
          method: 'DELETE',
          headers: auth,
        });
      }
    }
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
