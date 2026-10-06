import { test, expect } from '@playwright/test';

import { installHydrationProbe, waitForHydration } from './helpers/session';

test.describe('home', () => {
  test.beforeEach(async ({ page }) => {
    await installHydrationProbe(page);
    await page.goto('/');
    await waitForHydration(page);
  });

  test('should render hero and intro', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Hacemos que las ideas/i })).toBeVisible();
    await expect(page.getByText('Estudio creativo')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Prueba nuestro estudio de creación con IA' }),
    ).toBeVisible();
  });

  test('should show the project CTA section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /proyecto en mente/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escríbenos' })).toBeVisible();
  });

  test('should expose CTAs pointing to the login', async ({ page }) => {
    for (const name of [
      'Prueba nuestro estudio de creación con IA',
      'Escríbenos',
    ]) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', '/auth/login');
    }
    await expect(page.getByRole('link', { name: 'Contáctanos' })).toHaveAttribute(
      'href',
      /mailto:/,
    );
  });

  test('should show footer branding', async ({ page }) => {
    await expect(page.getByText('© 2026 Synapta')).toBeVisible();
  });
});
