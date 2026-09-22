import { test, expect } from '@playwright/test';
import { mockTradeablePairs, mockBalances, mockTradeHistory } from './mocks';

// App.tsx only ever renders ONE tab's component at a time (it's not four
// components hidden with CSS) — so "switch tabs" really does mount a
// different view each time, and we can just check what's on screen.

test('Prices is the default tab shown on load', async ({ page }) => {
  await mockTradeablePairs(page, []);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Prices' })).toBeVisible();
});

test('clicking a tab button shows that tab\'s view', async ({ page }) => {
  await mockTradeablePairs(page, []);
  await mockBalances(page, []);
  await mockTradeHistory(page, []);
  await page.goto('/');

  await page.getByRole('button', { name: 'Balances' }).click();
  await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible();

  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Trade History' }).click();
  await expect(page.getByRole('heading', { name: 'Trade History' })).toBeVisible();
});
