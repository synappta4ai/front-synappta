import type { Page } from '@playwright/test';

import { test, expect, waitForHydration } from './helpers/session';

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
  (_, i) => `Línea ${i + 1} — ESCENA "Padre e hijo exhaustos" ángulo @tienda-longe`,
).join('\n');

/** Request tal como lo guarda el back en generation_logs.request. */
const REUSED_REQUEST = {
  model: 'kling-3-turbo',
  content: [{ type: 'text', text: LONG_PROMPT }],
  ratio: '16:9',
  duration: 5,
  resolution: '720p',
  event_id: '',
  piece_id: '',
  piece_code: 'STU-E2E',
  generation_number: 1,
};

/**
 * Toma del historial con el request original. Se sirve por route para no
 * depender de generaciones reales del tenant (ni gastar créditos).
 */
const REUSED_TAKE = {
  id: 'log-e2e-reuse',
  task_id: 'e2e-reuse-task',
  model_name: 'kling-3-turbo',
  user_id: null,
  event_id: null,
  program_id: null,
  piece_id: null,
  piece_code: 'STU-E2E',
  generation_number: 1,
  request: JSON.stringify(REUSED_REQUEST),
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

  test('reusar una toma larga arranca al inicio y se puede reescribir', async ({
    authedPage: page,
  }) => {
    test.setTimeout(90_000);
    // El reel se hidrata al arrancar la app: se stubea el historial reciente.
    await page.route('**/agency/tasks/recent**', (route) =>
      route.fulfill({ json: { success: true, message: 'success', data: [REUSED_TAKE] } }),
    );
    await page.goto('/studio');
    await page.reload();
    await waitForHydration(page);

    const prompt = page.getByPlaceholder(/AGREGÁ TU PROMPT/);
    const takeCard = page.locator('.take-card').first();
    await expect(takeCard).toBeVisible({ timeout: 20_000 });

    // Se reusa desde el detalle de la toma (el botón del reel abre el detalle).
    await takeCard.click();
    const dialog = page.locator('.take-detail-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Reusar/ }).click();

    await expect
      .poll(async () => (await promptState(page)).value, { timeout: 20_000 })
      .toBe(LONG_PROMPT);
    await expect(dialog).toBeHidden();

    // Arranca arriba y con el caret al inicio, listo para reescribir.
    await expect
      .poll(async () => prompt.evaluate((el) => (el as HTMLTextAreaElement).selectionStart))
      .toBe(0);
    const reused = await promptState(page);
    expect(reused.textarea.scrollTop).toBe(0);
    expect(reused.overlay.scrollTop).toBe(0);
    expect(reused.overlay.clientH).toBe(reused.textarea.clientH);
    expect(reused.overlay.text).toBe(LONG_PROMPT);

    // Editable desde el principio: lo escrito queda al inicio del prompt.
    await page.keyboard.type('X');
    await expect.poll(async () => (await promptState(page)).value).toBe(`X${LONG_PROMPT}`);

    const edited = await promptState(page);
    expect(edited.overlay.text).toBe(edited.value);
    expect(edited.overlay.scrollTop).toBe(edited.textarea.scrollTop);
  });
});
