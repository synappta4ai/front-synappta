import { test, expect, type Page } from '@playwright/test';

import { installHydrationProbe, waitForHydration } from './helpers/session';

const submitButton = (page: Page) => page.locator('button[type="submit"]');

test.describe('auth', () => {
  test.beforeEach(async ({ page }) => {
    await installHydrationProbe(page);
    await page.goto('/auth/login');
    await waitForHydration(page);
    await expect(page).toHaveTitle('Login');
  });

  test('should render the login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(submitButton(page)).toBeVisible();
  });

  test('should show validation errors when submitting empty form', async ({ page }) => {
    await submitButton(page).click();

    await expect(page.locator('validator-errors .text-danger')).toHaveCount(2);

    await expect(page.getByText('El campo Usuario es requerido', { exact: true })).toBeVisible();
    await expect(page.getByText('El campo Contraseña es requerido', { exact: true })).toBeVisible();
  });

  test('should show minlength error for short username', async ({ page }) => {
    await page.getByLabel('Usuario').fill('ab');
    await submitButton(page).click();

    await expect(
      page.getByText('El campo Usuario debe tener al menos 4 caracteres', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('El campo Contraseña es requerido', { exact: true })).toBeVisible();
  });

  test('should clear validation errors after filling valid values', async ({ page }) => {
    await submitButton(page).click();
    await expect(page.locator('validator-errors .text-danger')).toHaveCount(2);

    await page.getByLabel('Usuario').fill('admin');
    await page.getByLabel('Contraseña').fill('1234');

    await expect(page.locator('validator-errors .text-danger')).toHaveCount(0);
  });
});
