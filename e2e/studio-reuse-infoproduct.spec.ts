import { test, expect, waitForHydration, apiLogin, API_BASE } from './helpers/session';

/**
 * Infoproductos → Estudio: el request viaja por sessionStorage ('studio:reuse')
 * y el form del Estudio debe quedar cargado (referencias incluidas) sin tocar
 * "Reusar", aunque los recursos no vengan en la primera página de la
 * biblioteca (se piden por id).
 */
test('estudio carga las referencias del request que llega de Infoproductos', async ({
  authedPage: page,
}) => {
  test.setTimeout(90_000);
  const { token } = await apiLogin();
  const auth = { Authorization: `Bearer ${token}` };
  const pageData = (await fetch(`${API_BASE}/files/page?page=1&page_size=50`, {
    headers: auth,
  }).then((r) => r.json())) as {
    data?: { items?: { id: string; filename: string; mime_type?: string | null }[] };
  };
  const images = (pageData.data?.items ?? [])
    .filter((f) => (f.mime_type ?? '').startsWith('image/'))
    .slice(0, 3);
  test.skip(images.length < 2, 'el tenant necesita al menos 2 imágenes');

  const models = (await fetch(`${API_BASE}/models`, { headers: auth }).then((r) => r.json())) as {
    data?: { name: string; modality?: string }[];
  };
  const model = (models.data ?? []).find((m) => m.modality === 'video')?.name ?? 'kling-3-turbo';

  const request = {
    model,
    content: [
      ...images.map((f) => ({ type: 'image', id: f.id, name: f.filename })),
      { type: 'text', text: 'Reference roles: [Image 1] is the identity.' },
    ],
    ratio: '9:16',
    duration: 4,
    resolution: '720p',
    event_id: '',
    piece_id: '',
    piece_code: 'STU-E2E',
    generation_number: 0,
  };

  // La biblioteca no devuelve esos archivos en la 1ª página: se piden por id.
  await page.route('**/files/page**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 200 },
      }),
    }),
  );
  await page.addInitScript(
    (r) => sessionStorage.setItem('studio:reuse', JSON.stringify(r)),
    request,
  );

  await page.goto('/studio');
  await waitForHydration(page);

  await expect(page.locator('.slot.filled')).toHaveCount(images.length);
  await expect(page.locator('.refs-meta').first()).toContainText(`${images.length}/`);
});
