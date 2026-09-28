import { test, expect } from '@playwright/test';

import { waitForHydration } from './helpers/session';

test.describe('home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
  });

  test('should render hero and services', async ({ page }) => {
    await expect(page.getByText('ESTUDIO CREATIVO')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hacemos que las ideas/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Qué hacemos' })).toBeVisible();
  });

  test('should list the three service cards', async ({ page }) => {
    for (const service of ['Producción de video', 'Estrategia de contenido', 'Campañas de marca']) {
      await expect(page.getByRole('heading', { name: service })).toBeVisible();
    }
  });

  test('should expose CTAs to agency and videos', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Conoce la agencia' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver videos' })).toBeVisible();
  });

  test('should show footer branding', async ({ page }) => {
    await expect(page.getByText('© 2026 Synapta')).toBeVisible();
  });
});
