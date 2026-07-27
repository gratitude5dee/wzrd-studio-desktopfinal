import { expect, test } from '@playwright/test';

const routeCases = [
  { path: '/home', active: 'All Projects' },
  { path: '/kanvas?studio=cinema', active: 'Kanvas' },
  { path: '/kanvas/lyrics', active: 'Kanvas' },
  { path: '/kanvas/remix', active: 'Kanvas' },
  { path: '/clipper', active: 'Clipper' },
  { path: '/sourcify', active: 'Sourcify' },
  { path: '/postz', active: 'Postz' },
  { path: '/ip-vault', active: 'IP Vault' },
] as const;

test.describe('expanded app sidebar', () => {
  for (const { path, active } of routeCases) {
    test(`renders expanded app sidebar on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });

      const sidebar = page.getByTestId('app-sidebar');
      await expect(sidebar).toBeVisible({ timeout: 45_000 });
      await expect(sidebar).toHaveAttribute('data-state', 'expanded');
      await expect(sidebar.getByRole('button', { name: active, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(sidebar.getByRole('button', { name: 'All Projects' })).toBeVisible();
      await expect(sidebar.getByRole('button', { name: 'Asset Store' })).toBeVisible();
      await expect(sidebar.getByRole('button', { name: 'IP Vault' })).toBeVisible();
    });
  }
});

test('nested Kanvas navigation expands and deep-links to a studio', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'domcontentloaded' });

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar.getByRole('button', { name: 'Kanvas', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar.getByRole('button', { name: 'Image' })).toBeVisible();

  await sidebar.getByRole('button', { name: 'Collapse Kanvas' }).click();
  await expect(sidebar.getByRole('button', { name: 'Kanvas', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar.getByRole('button', { name: 'Image' })).toBeHidden();

  await sidebar.getByRole('button', { name: 'Expand Kanvas' }).click();
  await sidebar.getByRole('button', { name: 'Video' }).click();
  await expect(page).toHaveURL(/\/kanvas\?studio=video$/);
  await expect(sidebar.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-current', 'page');
});

test('Clipper keeps Sourcify reachable as a nested child', async ({ page }) => {
  await page.goto('/sourcify', { waitUntil: 'domcontentloaded' });

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar.getByRole('button', { name: 'Clipper', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('button', { name: 'Sourcify' })).toHaveAttribute('aria-current', 'page');
});
