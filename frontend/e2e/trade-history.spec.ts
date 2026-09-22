import { test, expect } from '@playwright/test';
import { mockTradeHistory } from './mocks';

test('renders one row per trade', async ({ page }) => {
  await mockTradeHistory(page, [
    {
      id: 1,
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: '100.000000',
      toAmount: '0.001538',
      rate: '65000.00000000',
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      fromAmount: '0.500000',
      toAmount: '32500.000000',
      rate: '65000.00000000',
      createdAt: new Date().toISOString(),
    },
  ]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade History' }).click();

  await expect(page.getByRole('row', { name: /100.000000 USD.*0.001538 BTC/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /0.500000 BTC.*32500.000000 USD/ })).toBeVisible();
});

test('changing "Show last" re-fetches with the new limit', async ({ page }) => {
  let lastRequestedLimit: string | null = null;
  await page.route(
    (url) => url.pathname.endsWith('/trades'),
    (route) => {
      lastRequestedLimit = new URL(route.request().url()).searchParams.get('limit');
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade History' }).click();
  await expect.poll(() => lastRequestedLimit).toBe('50');

  await page.getByRole('spinbutton').fill('5');

  await expect.poll(() => lastRequestedLimit).toBe('5');
});
