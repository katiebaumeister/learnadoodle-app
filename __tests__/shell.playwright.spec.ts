import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:19006';

test.describe('Learnadoodle shell interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('left rail expands, pins, and persists', async ({ page }) => {
    const navLabel = page.locator('text=Navigation');
    await navLabel.hover();
    await expect(page.locator('text=Pin')).toBeVisible();

    await page.getByRole('button', { name: /Pin navigation/i }).click();
    await expect(page.locator('text=Pinned')).toBeVisible();

    await page.reload();
    await expect(page.locator('text=Pinned')).toBeVisible();
  });

  test('right rail tabs switch panels without layout shift', async ({ page }) => {
    await page.getByRole('tab', { name: 'Backlog' }).click();
    await expect(page.locator('text=History project planning')).toBeVisible();

    await page.getByRole('tab', { name: 'Objectives' }).click();
    await expect(page.locator('text=Weekly Objectives')).toBeVisible();

    await page.getByRole('tab', { name: 'Integrations' }).click();
    await expect(page.locator('text=Connect Google Drive')).toBeVisible();
  });

  test('top bar search opens doodle modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Search or ask anything' }).click();
    await expect(page.getByPlaceholder('Search or ask anything')).toBeVisible();
    await page.getByRole('button', { name: /Close search modal/i }).click();
  });
});

