import {
  test,
  expect,
  expectPageTitle,
  openPrimeSelect,
  apiLogin,
  API_BASE,
  waitForHydration,
  seedSession,
  installHydrationProbe,
} from './helpers/session';

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
    await expect(page.locator('.studio-mode')).toBeVisible();
    await expect(page.getByRole('button', { name: /Referencias/ })).toBeVisible();
    // Prompt negativo y seed solo se muestran para modelos del inference
    // worker: los dos campos comparten la misma condición (0 o 1 juntos).
    const modelSelect = page.getByRole('combobox', { name: 'Elegí el modelo de generación' });
    await expect(modelSelect).toBeVisible();
    const negatives = await page.locator('.negative-input').count();
    const seeds = await page.locator('.seed-input').count();
    expect(negatives).toBe(seeds);
    if ((await modelSelect.innerText()).includes('Elegí el modelo de generación')) {
      // Sin modelo elegido no hay modelo del worker: los dos campos ocultos.
      expect(negatives).toBe(0);
    }
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

  test('crea un proyecto rápido desde la modal y lo selecciona', async ({
    authedPage: page,
  }) => {
    const name = `E2E Studio ${Date.now()}`;
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };
    let createdId: string | null = null;
    try {
      await page.goto('/studio');
      await waitForHydration(page);
      await expect(page.getByPlaceholder(/AGREGÁ TU PROMPT/)).toBeVisible();

      await page.locator('.project-icon-btn').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByLabel('Nombre del proyecto nuevo').fill(name);
      await dialog.getByRole('button', { name: 'Crear' }).click();

      // Queda seleccionado: el caption del panel lo muestra.
      await expect(page.locator('.project-caption')).toContainText(name);

      const list = await fetch(`${API_BASE}/events?all=true`, { headers: auth }).then((r) =>
        r.json(),
      );
      const found = (list.data ?? []).find(
        (event: { id: string; name: string }) => event.name === name,
      );
      expect(found, 'el proyecto creado no aparece en /events').toBeTruthy();
      createdId = found.id;
    } finally {
      if (createdId) {
        await fetch(`${API_BASE}/events/${createdId}`, { method: 'DELETE', headers: auth });
      }
    }
  });

  test('las opciones del select de ratio muestran el recuadro de ejemplo', async ({
    authedPage: page,
  }) => {
    await page.goto('/studio');
    await expect(page.getByPlaceholder(/AGREGÁ TU PROMPT/)).toBeVisible();
    const select = page.locator('.foot-select').filter({ hasText: '16:9' }).first();
    let opened = false;
    for (let i = 0; i < 4 && !opened; i++) {
      await select.click();
      opened = await page
        .locator('.p-select-overlay:not(.p-select-overlay-hidden)')
        .last()
        .waitFor({ state: 'visible', timeout: 2000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(opened, 'overlay del select de ratio no abrió').toBe(true);
    // El overlay vive en <body> (appendTo): el recuadro no debe colapsar.
    const overlay = page.locator('.p-select-overlay:not(.p-select-overlay-hidden)').last();
    await expect(overlay.locator('.ratio-screen')).not.toHaveCount(0);
    const widths = await overlay.locator('.ratio-screen').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getBoundingClientRect().width),
    );
    for (const w of widths) {
      expect(w, 'recuadro con width 0 en el overlay').toBeGreaterThan(0);
    }
  });
});

// /video y /events quedaron comentadas en app.routes.ts: el wildcard las
// redirige a /agency. Estos tests documentan ese retiro.
test.describe('menciones @ del studio', () => {
  test('prioriza el id de elemento y abre Referencias al citar', async ({
    authedPage: page,
  }) => {
    // Catálogo de ingredientes lento bajo paralelismo: margen extra.
    const { token } = await apiLogin();
    const list = await fetch(`${API_BASE}/ingredients`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    const ingredients = (Array.isArray(list.data) ? list.data : []).map(
      (row: { ingredient?: unknown }) => row.ingredient ?? row,
    );
    const first = ingredients.find((ing: { metadata?: string }) => {
      try {
        return !!JSON.parse(ing.metadata ?? '{}').element_id;
      } catch {
        return false;
      }
    });
    const elementId = first
      ? String(JSON.parse(first.metadata).element_id).replace(/^@/, '')
      : '';
    const fileCount: number = first ? (first.files ?? []).length : 0;
    test.skip(!elementId, 'ningún ingrediente tiene element_id');

    await page.goto('/studio');
    await expect(page.getByPlaceholder(/AGREGÁ TU PROMPT/)).toBeVisible();
    // El panel de referencias arranca cerrado.
    await expect(page.locator('.refs-panel .acc-wrap')).toHaveCount(0);

    const prompt = page.getByPlaceholder(/AGREGÁ TU PROMPT/);
    const options = page.locator('.mention-menu .mention-option');
    // El menú solo se abre cuando el catálogo de ingredientes ya cargó.
    for (let attempt = 0; attempt < 4 && (await options.count()) === 0; attempt++) {
      await prompt.click();
      await prompt.fill('');
      await prompt.type('@');
      await page.waitForTimeout(1200);
    }
    await expect(options.first()).toBeVisible({ timeout: 10_000 });
    // Prioridad: la primera fila es el id de elemento, no un filename.
    await expect(options.first()).toContainText(elementId);
    // La fila de ingrediente muestra la miniatura de su primer recurso.
    if (fileCount > 0) {
      await expect(options.first().locator('img.mention-thumb')).toBeVisible();
    }

    await options.first().click();
    // La mención cita refs: el panel se auto-abre y muestra las citadas.
    await expect(page.locator('.mention-chip')).toContainText(`@${elementId}`);
    await expect(page.locator('.refs-panel .acc-wrap')).toHaveCount(1);
    if (fileCount > 0) {
      // El chip del ingrediente usa la miniatura, no solo el ícono de tipo.
      const chip = page.locator('.mention-chip.ingredient').filter({ hasText: `@${elementId}` });
      const chipThumb = chip.locator('img.mention-chip-thumb');
      await expect(chipThumb).toBeVisible();
      expect(await chipThumb.getAttribute('src'), 'chip sin thumbnail').toBeTruthy();
      await expect(page.locator('.refs-panel .asset-thumb.selected').first()).toBeVisible();
      // Los recursos citados quedan al frente de la grilla del panel.
      await expect(page.locator('.asset-grid .asset-thumb').first()).toHaveClass(/selected/);
      await expect(page.locator('.refs-panel .refs-meta')).toContainText('seleccionadas');
    }
  }, { timeout: 60_000 });
});

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

test.describe('nav-bar', () => {
  test('con foto de usuario reemplaza el logo cuadrado por el avatar', async ({ page }) => {
    await seedSession(page, { avatar_url: '/uploads/nav-avatar-test.png' });
    await installHydrationProbe(page);
    await page.goto('/studio');
    await waitForHydration(page);
    const avatar = page.locator('app-nav-bar img[alt="Foto de perfil"]');
    await expect(avatar).toBeVisible();
    expect(await avatar.getAttribute('src')).toContain('nav-avatar-test.png');
    // El logo por defecto queda reemplazado.
    await expect(page.locator('app-nav-bar img[alt="Logo Synapta"]')).toHaveCount(0);
  });

  test('el nav-bar muestra exactamente una imagen: avatar si hay, si no logo', async ({
    authedPage: page,
  }) => {
    await page.goto('/studio');
    const logo = page.locator('app-nav-bar img[alt="Logo Synapta"]');
    const avatar = page.locator('app-nav-bar img[alt="Foto de perfil"]');
    await expect(logo.or(avatar).first()).toBeVisible();
    const total = (await logo.count()) + (await avatar.count());
    expect(total, 'avatar y logo a la vez, o ninguno').toBe(1);
  });
});

test.describe('auth guard', () => {
  test('redirects anonymous users from private routes to login', async ({ page }) => {
    await page.goto('/studio');
    await page.waitForURL(/\/auth\/login/);
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
