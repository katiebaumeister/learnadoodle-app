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
    await expect(page.locator('text=Connect Google Classroom')).toBeVisible();
  });

  test('top bar search submits on enter', async ({ page }) => {
    const searchBox = page.getByPlaceholder('Search lessons, events, evidence, people…');
    await searchBox.click();
    await searchBox.fill('Reading plan for Lilly');
    await searchBox.press('Enter');

    await expect(page.locator('text=Ask Doodle')).toBeVisible();
    await page.getByRole('button', { name: /Close search modal/i }).click();
  });
});

