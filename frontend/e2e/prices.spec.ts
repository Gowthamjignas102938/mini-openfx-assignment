import { test, expect } from '@playwright/test';
import { mockTradeablePairs, mockPrice } from './mocks';

const PAIRS = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', bid: 65000, ask: 65010 },
  { symbol: 'EURUSDT', base: 'EUR', quote: 'USDT', bid: 1.08, ask: 1.09 },
];

test('renders one table row per tradeable pair', async ({ page }) => {
  await mockTradeablePairs(page, PAIRS);
  await page.goto('/');

  await expect(page.getByRole('row', { name: /BTC\/USDT.*65000.*65010/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /EUR\/USDT.*1.08.*1.09/ })).toBeVisible();
});

test('clicking a pair row fills the manual lookup input with its symbol', async ({ page }) => {
  await mockTradeablePairs(page, PAIRS);
  await page.goto('/');

  await page.getByRole('row', { name: /EUR\/USDT/ }).click();

  await expect(page.getByPlaceholder('e.g. BTCUSDT')).toHaveValue('EURUSDT');
});

test('manual lookup shows the fetched price', async ({ page }) => {
  await mockTradeablePairs(page, []);
  await mockPrice(page, {
    symbol: 'BTCUSDT',
    bid: 65000,
    ask: 65010,
    timestamp: Date.now(),
    source: 'binance',
  });
  await page.goto('/');

  await page.getByPlaceholder('e.g. BTCUSDT').fill('BTCUSDT');
  await page.getByRole('button', { name: 'Get Price' }).click();

  await expect(page.getByText('65000', { exact: true })).toBeVisible();
  await expect(page.getByText('65010', { exact: true })).toBeVisible();
});

test('a failed lookup shows the backend\'s error message', async ({ page }) => {
  await mockTradeablePairs(page, []);
  await mockPrice(page, { message: 'Unknown symbol "BOGUS"' }, 400);
  await page.goto('/');

  await page.getByPlaceholder('e.g. BTCUSDT').fill('BOGUS');
  await page.getByRole('button', { name: 'Get Price' }).click();

  await expect(page.getByText('Unknown symbol "BOGUS"')).toBeVisible();
});
