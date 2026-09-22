import { test, expect } from '@playwright/test';
import { mockBalances } from './mocks';

test('renders one row per balance', async ({ page }) => {
  await mockBalances(page, [
    { currency: 'USD', amount: '1000.000000', updatedAt: new Date().toISOString() },
    { currency: 'BTC', amount: '1.500000', updatedAt: new Date().toISOString() },
  ]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Balances' }).click();

  await expect(page.getByText('USD')).toBeVisible();
  await expect(page.getByText('1000.000000')).toBeVisible();
  await expect(page.getByText('BTC')).toBeVisible();
  await expect(page.getByText('1.500000')).toBeVisible();
});
