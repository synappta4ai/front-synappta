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
  test('renders the inmobiliaria flow page', async ({ authedPage: page }) => {
    await page.goto('/agency');
    await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
  });

  test('/agency es solo el flujo Inmobiliaria con modelo por paso', async ({
    authedPage: page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/agency');
    await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
    await waitForHydration(page);

    // Sin pestañas de flujo y sin el panel del chat del asistente.
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByText('Cine / Ficción')).toHaveCount(0);
    await expect(page.getByPlaceholder(/ficha técnica/)).toHaveCount(0);
    await expect(page.locator('.custom-steps')).toBeVisible();

    // Paso 1: selector del modelo de ángulos con opciones del catálogo.
    await expect(page.locator('#agencyTextModel')).toBeVisible();
    await openPrimeSelect(page.locator('#agencyTextModel'));
    const opts = page.locator('.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option');
    await expect(opts.first()).toBeVisible();
    // 'Automático' + al menos un modelo de texto del catálogo.
    expect(await opts.count()).toBeGreaterThanOrEqual(2);

    // Y el modelo LLM configurado en admin/models (credencial del tenant).
    const { token } = await apiLogin();
    const creds = await fetch(`${API_BASE}/credentials`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    const withModel = (Array.isArray(creds.data) ? creds.data : []).find(
      (c: { provider?: string; extra?: string }) =>
        (c.provider === 'openrouter' || c.provider === 'anthropic') && !!c.extra,
    ) as { extra?: string } | undefined;
    if (withModel?.extra) {
      try {
        const model = (JSON.parse(withModel.extra) as { model?: string }).model;
        if (model) {
          await expect(opts.filter({ hasText: model })).toBeVisible();
        }
      } catch {
        // extra no-JSON: nada que asertar.
      }
    }
  });

  test('elegir un proyecto existente carga sus datos y exige los campos', async ({
    authedPage: page,
  }) => {
    test.setTimeout(60_000);
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };
    const name = `E2E Proyecto Existe ${Date.now()}`;
    let myId: string | null = null;

    try {
      // Proyecto propio y sin avance: así no hay que tocar la metadata de
      // proyectos de otros tests (con fullyParallel eso era una carrera).
      const created = (await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          venue: '',
          description: '',
        }),
      }).then((r) => r.json())) as { data?: { id?: string }; id?: string };
      myId = created?.data?.id ?? created?.id ?? null;
      expect(myId, 'el proyecto de prueba debe crearse').toBeTruthy();

      await page.goto('/agency');
      await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
      await waitForHydration(page);

      // Selección del proyecto propio (select en el header de la card).
      await openPrimeSelect(page.locator('#agencyProject'));
      const options = page.locator(
        '.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option',
      );
      await expect(options.first()).toBeVisible();
      await options.filter({ hasText: name }).click();

      // Los datos del proyecto se cargan en los inputs; el nombre queda bloqueado.
      await expect(page.locator('#propertyName')).toHaveValue(name);
      await expect(page.locator('#propertyName')).toBeDisabled();
      const loadedName = name;

      // Los campos obligatorios que el proyecto no traiga quedan editables.
      const marker = Date.now();
      const cityMarker = `E2E City ${marker}`;
      const descMarker = `E2E Desc ${marker}`;
      const location = page.locator('#location');
      const description = page.locator('#description');
      let patchedLocation = false;
      let patchedDescription = false;
      if ((await location.inputValue()) === '') {
        await location.fill(cityMarker);
        patchedLocation = true;
      } else {
        await expect(location).toBeDisabled();
      }
      if ((await description.inputValue()) === '') {
        await description.fill(descMarker);
        patchedDescription = true;
      } else {
        await expect(description).toBeDisabled();
      }

      // La creación de ángulos queda habilitada con los tres campos completos.
      const analyze = page.getByRole('button', { name: /Analizar y generar ángulos/ });
      await expect(analyze).toBeEnabled();
      await analyze.click();
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 20_000,
      });

      // Verifica lo persistido en el proyecto del test.
      const list = await fetch(`${API_BASE}/events?all=false`, { headers: auth }).then((r) =>
        r.json(),
      );
      const events = (Array.isArray(list.data) ? list.data : []).map(
        (row: { event?: unknown }) => row.event ?? row,
      );
      const target = events.find(
        (ev: { name?: string; venue?: string | null; description?: string | null }) =>
          ev.name === loadedName,
      ) as
        | { id: string; venue?: string | null; description?: string | null; metadata?: string | null }
        | undefined;
      expect(target, 'el proyecto actualizado debe existir').toBeTruthy();
      if (target) {
        if (patchedLocation) expect(target.venue ?? '').toContain(cityMarker);
        if (patchedDescription) expect(target.description ?? '').toContain(descMarker);
      }
    } finally {
      // El proyecto es del test: se borra entero (sin dejar avance).
      if (myId) {
        await fetch(`${API_BASE}/events/${myId}`, { method: 'DELETE', headers: auth });
      }
    }
  });

  test('crear un proyecto nuevo va directo a la creación de ángulos', async ({
    authedPage: page,
  }) => {
    test.setTimeout(120_000);
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };
    const name = `E2E Agencia Ángulos ${Date.now()}`;

    try {
      await page.goto('/agency');
      await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
      await waitForHydration(page);

      // Sin proyecto elegido: los campos están habilitados para crear.
      await expect(page.locator('#propertyName')).toBeEnabled();
      await page.locator('#propertyName').fill(name);
      await page.locator('#location').fill('E2E, Polanco');

      // La descripción/puntos fuertes es obligatoria: sin ella no se avanza.
      const analyze = page.getByRole('button', { name: /Analizar y generar ángulos/ });
      await expect(analyze).toBeDisabled();
      await page.locator('#description').fill('Amenidades premium y azotea con vista.');

      // Por defecto se piden 3 ángulos; el test pide 4.
      await expect(page.locator('#anglesCount')).toHaveValue('3');
      await page.locator('#anglesCount').fill('4');

      await expect(analyze).toBeEnabled();
      await analyze.click();
      // Directo a la creación de ángulos de venta (sin pasar por otras fases).
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 20_000,
      });
      // Se crearon exactamente los ángulos pedidos en el input numérico.
      await expect(page.getByLabel('Título del ángulo')).toHaveCount(4);
      // Paso 2: selector del modelo de imágenes disponible en Ángulos.
      await expect(page.locator('#agencyImageModel')).toBeVisible();

      // El proyecto quedó creado y fijado en el select (datos cargados y bloqueados).
      await page.getByRole('button', { name: /← Volver|Volver/ }).first().click();
      await expect(page.locator('#propertyName')).toHaveValue(name);
      await expect(page.locator('#propertyName')).toBeDisabled();
      await expect(page.locator('#location')).toBeDisabled();

      // El avance quedó guardado en metadata del proyecto (evita reprocesos).
      const list = await fetch(`${API_BASE}/events?all=false`, { headers: auth }).then((r) =>
        r.json(),
      );
      const rows = (Array.isArray(list.data) ? list.data : []).map(
        (row: { event?: unknown }) => row.event ?? row,
      );
      const created = rows.find((ev: { name?: string }) => ev.name === name) as
        | { id: string; metadata?: string | null }
        | undefined;
      expect(created, 'el proyecto creado debe existir').toBeTruthy();
      const agencyMeta = JSON.parse(created?.metadata ?? '{}') as {
        agency?: { phase?: string; anglesCount?: number };
      };
      expect(agencyMeta.agency?.phase).toBe('angles');
      expect(agencyMeta.agency?.anglesCount).toBe(4);

      // Recuperar: recargar y elegir el proyecto restaura fase y ángulos.
      await page.goto('/agency');
      await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
      await waitForHydration(page);
      await openPrimeSelect(page.locator('#agencyProject'));
      const opts = page.locator(
        '.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option',
      );
      await opts.filter({ hasText: name }).click();
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByLabel('Título del ángulo')).toHaveCount(4);

      // Ajuste sobre la generación: editar un ángulo actualiza la vista.
      const titleInput = page.getByLabel('Título del ángulo').first();
      await titleInput.fill('Ángulo ajustado E2E');
      await expect(titleInput).toHaveValue('Ángulo ajustado E2E');

      // El contador restaurado (4) vive en el paso 1: volver y re-analizar.
      await page.getByRole('button', { name: /← Volver|Volver/ }).first().click();
      await expect(page.locator('#anglesCount')).toHaveValue('4');
      await page.getByRole('button', { name: /Analizar y generar ángulos/ }).click();
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByLabel('Título del ángulo')).toHaveCount(4);

      // Elegir un ángulo → Storyboard (modelo de videos) → Escenas (video).
      // Click en la esquina de la card (fuera de los campos editables).
      await page
        .locator('.phase-card [role="checkbox"]')
        .first()
        .click({ position: { x: 10, y: 10 } });
      await page.getByRole('button', { name: /Generar Storyboard/ }).click();
      await expect(page.locator('#agencyVideoModel')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /Continuar a Escenas/ }).click();
      await expect(page.getByRole('button', { name: /Generar video/ }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      // Limpieza: borra el proyecto creado por el test.
      const list = await fetch(`${API_BASE}/events?all=true`, { headers: auth }).then((r) =>
        r.json(),
      );
      const created = (Array.isArray(list.data) ? list.data : []).find(
        (row: { event?: { name?: string; id?: string }; name?: string; id?: string }) =>
          (row.event ?? row).name === name,
      );
      const id = created ? (created.event ?? created).id : null;
      if (id) {
        await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE', headers: auth });
      }
    }
  });

  test('tildar ángulos habilita Generar Storyboard y persiste al recargar', async ({
    authedPage: page,
  }) => {
    test.setTimeout(90_000);
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };
    const name = `E2E Ángulos Check ${Date.now()}`;
    let projectId: string | null = null;

    try {
      // Proyecto con la fase de ángulos sembrada por API (sin invocar al agente).
      const created = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          venue: 'E2E, CDMX',
          description: 'Proyecto para verificar el tildado de ángulos.',
          metadata: JSON.stringify({
            agency: {
              phase: 'angles',
              anglesCount: 3,
              models: { text: '', image: '', video: '' },
              angles: [1, 2, 3].map((i) => ({
                id: `angle-${i}`,
                title: `Ángulo ${i}`,
                description: `desc ${i}`,
                selected: false,
              })),
              storyboard: [],
              projectDescription: name,
            },
          }),
        }),
      }).then((r) => r.json()) as { data?: { id?: string }; id?: string };
      projectId = created?.data?.id ?? created?.id ?? null;
      expect(projectId, 'el proyecto de prueba debe crearse').toBeTruthy();

      await page.goto('/agency');
      await expectPageTitle(page, 'Agencia · Flujo de Inmobiliaria');
      await waitForHydration(page);

      await openPrimeSelect(page.locator('#agencyProject'));
      const opts = page.locator(
        '.p-select-overlay:not(.p-select-overlay-hidden) .p-select-option',
      );
      await opts.filter({ hasText: name }).click();
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 20_000,
      });

      const cards = page.locator('.phase-card [role="checkbox"]');
      const btn = page.getByRole('button', { name: /Generar Storyboard/ });
      const counter = page.locator('.phase-card .p-tag');
      await expect(cards).toHaveCount(3);
      await expect(btn).toBeDisabled();
      await expect(counter).toHaveCount(0);

      // Un click sobre la zona del checkbox tilda (el checkbox es decorativo
      // y el evento cae en la card): sin doble disparo ni reversión.
      for (let i = 0; i < 3; i++) {
        await cards.nth(i).locator('.p-checkbox').click({ force: true });
        await expect(cards.nth(i)).toHaveAttribute('aria-checked', 'true');
      }
      await expect(btn).toBeEnabled();
      await expect(counter).toContainText('3 seleccionados');

      // Escribir en los campos no alterna el tildado (mismo click que la card).
      await page.getByLabel('Descripción del ángulo').first().click();
      await expect(cards.first()).toHaveAttribute('aria-checked', 'true');

      // role=checkbox con teclado: Space destilda, Enter vuelve a tildar.
      await cards.first().focus();
      await page.keyboard.press('Space');
      await expect(cards.first()).toHaveAttribute('aria-checked', 'false');
      await expect(counter).toContainText('2 seleccionados');
      await expect(btn).toBeEnabled();
      await page.keyboard.press('Enter');
      await expect(cards.first()).toHaveAttribute('aria-checked', 'true');

      // La selección queda guardada en el proyecto (cola de persistencia:
      // el último PATCH es el estado definitivo, no un intermedio).
      const selectedPersisted = async (): Promise<number> => {
        const persisted = (await fetch(`${API_BASE}/events/${projectId}`, {
          headers: auth,
        }).then((r) => r.json())) as {
          data?: { event?: { metadata?: string | null }; metadata?: string | null };
        };
        const persistedMeta =
          persisted.data?.event?.metadata ?? persisted.data?.metadata ?? '{}';
        const angles = (
          JSON.parse(persistedMeta) as {
            agency?: { angles?: { selected?: boolean }[] };
          }
        ).agency?.angles;
        return angles?.filter((a) => a.selected).length ?? 0;
      };
      await expect
        .poll(selectedPersisted, { timeout: 10_000 })
        .toBe(3);

      await page.reload();
      await waitForHydration(page);
      await openPrimeSelect(page.locator('#agencyProject'));
      await opts.filter({ hasText: name }).click();
      await expect(page.getByRole('heading', { name: 'Ángulos de Venta' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(cards.first()).toHaveAttribute('aria-checked', 'true');
      await expect(btn).toBeEnabled();
    } finally {
      if (projectId) {
        await fetch(`${API_BASE}/events/${projectId}`, { method: 'DELETE', headers: auth });
      }
    }
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
    // El 3er argumento de test() no acepta timeout en Playwright 1.63:
    // se fija por test.setTimeout (bajo paralelismo supera los 30s).
    test.setTimeout(60_000);
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
  });
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
