import type { Page } from '@playwright/test';

import { test, expect, waitForHydration, apiLogin, API_BASE } from './helpers/session';

/**
 * El prompt del Studio es un textarea transparente con un overlay detrás que
 * repite el texto (y resalta los @). Con texto largo el textarea supera su
 * max-height y scrollea por dentro: el overlay tiene que seguirlo o se ve un
 * texto y se edita otro. El reuso carga un request guardado en ese mismo
 * formulario, así que se cubre con el mismo mecanismo.
 */

/** 40 líneas: más alto que el max-height del textarea (320px). */
const LONG_PROMPT = Array.from(
  { length: 40 },
  (_, i) => `Línea ${i + 1} — ESCENA "Padre e hijo exhaustos", plano ${i + 1}`,
).join('\n');

/** Request tal como lo guarda el back en generation_logs.request. */
interface ReusedRef {
  id: string;
  filename: string;
}

function reusedRequest(ref: ReusedRef | null, text: string, model: string, eventId = '') {
  return {
    model,
    content: [
      ...(ref ? [{ type: 'image', id: ref.id, name: ref.filename }] : []),
      { type: 'text', text },
    ],
    ratio: '16:9',
    duration: 5,
    resolution: '720p',
    event_id: eventId,
    piece_id: '',
    piece_code: 'STU-E2E',
    generation_number: 1,
  };
}

/**
 * Toma del historial con el request original. Se sirve por route para no
 * depender de generaciones reales del tenant (ni gastar créditos).
 */
function reusedTake(request: ReturnType<typeof reusedRequest>) {
  return {
    id: 'log-e2e-reuse',
    task_id: 'e2e-reuse-task',
    model_name: 'kling-3-turbo',
    user_id: null,
    event_id: null,
    program_id: null,
    piece_id: null,
    piece_code: 'STU-E2E',
    generation_number: 1,
    request: JSON.stringify(request),
    outputs: [],
    status: 'succeeded',
    error_message: null,
    resource_type: 'video',
    estimated_cost: 0,
    cost_source: null,
    cost_credits: 0,
    provider_transaction_id: '',
    usage_tokens: 0,
    usage_completion_tokens: 0,
    video_duration: 5,
    video_resolution: '720p',
    video_ratio: '16:9',
    video_seed: 0,
    video_fps: 24,
    progress: 100,
    rating_good: false,
    rating_final: false,
    event_name: null,
    piece_name: null,
    user_display_name: null,
    created_at: new Date().toISOString(),
  };
}

/** Estado del espejo: alto y scroll de textarea y overlay. */
async function promptState(page: Page) {
  const textarea = page.getByPlaceholder(/AGREGÁ TU PROMPT/);
  const overlay = page.locator('.prompt-overlay');
  return {
    textarea: await textarea.evaluate((el) => ({
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      scrollTop: el.scrollTop,
    })),
    overlay: await overlay.evaluate((el) => ({
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      scrollTop: el.scrollTop,
      text: (el.textContent ?? '').trim(),
    })),
    value: await textarea.inputValue(),
  };
}

test.describe('studio · prompt', () => {
  test('el overlay espejo sigue el scroll interno y deja reescribir', async ({
    authedPage: page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/studio');
    await waitForHydration(page);

    const prompt = page.getByPlaceholder(/AGREGÁ TU PROMPT/);
    await expect(prompt).toBeVisible();

    await prompt.fill(LONG_PROMPT);
    await expect.poll(async () => (await promptState(page)).overlay.text).toBe(LONG_PROMPT);

    const pasted = await promptState(page);
    // El prompt largo scrollea por dentro (no empuja el panel).
    expect(pasted.textarea.scrollH).toBeGreaterThan(pasted.textarea.clientH + 50);
    // Overlay y textarea comparten caja: mismo alto y mismo rango de scroll.
    expect(pasted.overlay.clientH).toBe(pasted.textarea.clientH);
    expect(pasted.overlay.scrollH).toBe(pasted.textarea.scrollH);

    // El scroll interno se refleja en el overlay.
    await prompt.evaluate((el) => {
      el.scrollTop = 400;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => (await promptState(page)).overlay.scrollTop).toBe(400);

    // Reescribir abajo del todo: el texto entra y el espejo no se desfasa.
    await prompt.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' ESCRITO');
    await expect(prompt).toHaveValue(/ESCRITO$/);

    const edited = await promptState(page);
    expect(edited.value).toMatch(/ESCRITO$/);
    expect(edited.overlay.text).toBe(edited.value);
    expect(edited.overlay.scrollTop).toBe(edited.textarea.scrollTop);

    // Volver arriba también queda alineado.
    await prompt.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => (await promptState(page)).overlay.scrollTop).toBe(0);
  });

  test('reusar una toma arranca al inicio y restaura sus referencias', async ({
    authedPage: page,
  }) => {
    test.setTimeout(120_000);
    // Imagen real de la biblioteca: el request la cita por id (no por @).
    const { token } = await apiLogin();
    const auth = { Authorization: `Bearer ${token}` };
    const pageData = (await fetch(`${API_BASE}/files/page?page=1&page_size=50`, {
      headers: auth,
    }).then((r) => r.json())) as {
      data?: { items?: { id: string; filename: string; mime_type?: string | null }[] };
    };
    const ref = (pageData.data?.items ?? []).find((f) => (f.mime_type ?? '').startsWith('image/'));
    test.skip(!ref, 'la biblioteca del entorno no tiene imágenes para citar');

    const models = (await fetch(`${API_BASE}/models`, { headers: auth }).then((r) => r.json())) as {
      data?: { name: string; modality?: string }[];
    };
    const model = (models.data ?? []).find((m) => m.modality === 'video')?.name;
    test.skip(!model, 'el catálogo no tiene modelos de video');

    // Proyecto propio para no dejar rastro en los datos del tenant.
    const created = (await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `E2E Reuso Studio ${Date.now()}`, venue: '', description: '' }),
    }).then((r) => r.json())) as { data?: { id?: string }; id?: string };
    const projectId = created?.data?.id ?? created?.id ?? null;
    expect(projectId, 'el proyecto del test debe crearse').toBeTruthy();

    try {
      await runReuse(page, { ref: ref!, model: model!, projectId: projectId! });
    } finally {
      if (projectId) {
        await fetch(`${API_BASE}/events/${projectId}`, { method: 'DELETE', headers: auth });
      }
    }
  });
});

/** Reuso + restauración de refs + payload de generación (sin llamar al proveedor). */
async function runReuse(
  page: Page,
  ctx: { ref: ReusedRef; model: string; projectId: string },
): Promise<void> {
  const { ref, model, projectId } = ctx;
  const promptText = `${LONG_PROMPT}\n@ref-fantasma`;
  // El request cita la imagen por id; el texto trae un @ que no resuelve.
  const request = reusedRequest(ref, promptText, model, projectId);

  // El reel se hidrata al arrancar la app: se stubea el historial reciente.
  await page.route('**/agency/tasks/recent**', (route) =>
    route.fulfill({
      json: { success: true, message: 'success', data: [reusedTake(request)] },
    }),
  );
  await page.goto('/studio');
  await page.reload();
  await waitForHydration(page);

  const prompt = page.getByPlaceholder(/AGREGÁ TU PROMPT/);
  const takeCard = page.locator('.take-card').first();
  await expect(takeCard).toBeVisible({ timeout: 20_000 });

  // Se reusa desde el detalle de la toma (el botón del reel abre el detalle).
  const dialog = page.locator('.take-detail-dialog');
  for (let attempt = 0; attempt < 3; attempt++) {
    await takeCard.click();
    const open = await dialog
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (open) {
      break;
    }
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Reusar/ }).click();

  await expect
    .poll(async () => (await promptState(page)).value, { timeout: 20_000 })
    .toBe(promptText);
  await expect(dialog).toBeHidden();

  // Referencias del request restauradas por id: seleccionada + en su slot.
  const refsPanel = page.locator('.refs-panel');
  await expect(refsPanel.locator('.refs-meta')).toContainText('1/12');
  const selectedThumb = refsPanel.locator('.asset-thumb.selected');
  await expect(selectedThumb).toHaveCount(1);
  await expect(selectedThumb).toHaveAttribute('title', ref.filename);
  await expect(refsPanel.locator('.slot.filled')).toHaveCount(1);
  await expect(refsPanel.locator('.slot.filled img.slot-img')).toHaveCount(1);
  // El @fantasma no resuelve: la referencia vino del request, no del texto.
  await expect(page.locator('.mention-chip')).toHaveCount(0);

  // Arranca arriba y con el caret al inicio, listo para reescribir.
  await expect
    .poll(async () => prompt.evaluate((el) => (el as HTMLTextAreaElement).selectionStart))
    .toBe(0);
  const reused = await promptState(page);
  expect(reused.textarea.scrollTop).toBe(0);
  expect(reused.overlay.scrollTop).toBe(0);
  expect(reused.overlay.clientH).toBe(reused.textarea.clientH);
  expect(reused.overlay.text).toBe(promptText);

  // Editable desde el principio: lo escrito queda al inicio del prompt.
  await page.keyboard.type('X');
  await expect.poll(async () => (await promptState(page)).value).toBe(`X${promptText}`);

  const edited = await promptState(page);
  expect(edited.overlay.text).toBe(edited.value);
  expect(edited.overlay.scrollTop).toBe(edited.textarea.scrollTop);

  // Generar: se intercepta la salida para verificar el payload sin gastar
  // créditos (y sin crear piezas reales en el tenant).
  await page.route('**/pieces**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, message: 'success', data: [] } })
      : route.fulfill({
          json: {
            success: true,
            message: 'success',
            data: { id: 'e2e-piece', piece_code: 'STU-E2E', name: 'Studio E2E' },
          },
        }),
  );
  await page.route('**/agency/video/generate', (route) => route.abort());
  const pending = page.waitForRequest(
    (req) => req.url().includes('/agency/video/generate') && req.method() === 'POST',
  );
  await page.getByRole('button', { name: /Generar video/i }).click();
  const body = (await pending).postDataJSON() as {
    content?: { type?: string; id?: string; text?: string }[];
  };
  const content = body.content ?? [];
  // La referencia restaurada viaja en el payload: el video sale con la misma
  // esencia del original aunque el @ del texto no resuelva.
  expect(content.some((c) => c.type === 'image' && c.id === ref.id)).toBe(true);
  // El texto que se edita es el que viaja (con la modificación del usuario).
  const textItem = content.find((c) => c.type === 'text')?.text ?? '';
  expect(textItem.startsWith('X')).toBe(true);
  expect(textItem).toContain('Línea 40');
}
