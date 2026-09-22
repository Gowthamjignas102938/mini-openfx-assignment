import { test, expect } from '@playwright/test';
import { mockPrice, mockCreateTrade, mockPreviewTrade } from './mocks';

const FAKE_PRICE = { symbol: 'BTCUSDT', bid: 65000, ask: 65010, timestamp: Date.now(), source: 'binance' };

test('Execute Trade is disabled until a price has been fetched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Execute Trade' })).toBeDisabled();
  await expect(page.getByText("Fetch a price first")).toBeVisible();
});

test('fetching a price shows the bid/ask and a 15s countdown, and enables the button', async ({ page }) => {
  await mockPrice(page, FAKE_PRICE);
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade', exact: true }).click();

  await page.getByRole('button', { name: 'Fetch Price' }).click();

  await expect(page.getByText('65000', { exact: false })).toBeVisible();
  await expect(page.getByText('Valid for 15s')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Execute Trade' })).toBeEnabled();
});

test('a successful trade shows the success message', async ({ page }) => {
  await mockPrice(page, FAKE_PRICE);
  await mockPreviewTrade(page, {
    fromAmount: '100.000000',
    toAmount: '0.001538',
    rate: '65000.00000000',
    symbol: 'BTCUSDT',
  });
  await mockCreateTrade(page, {
    id: 42,
    fromCurrency: 'USD',
    toCurrency: 'BTC',
    fromAmount: '100.000000',
    toAmount: '0.001538',
    rate: '65000.00000000',
    createdAt: new Date().toISOString(),
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  await page.getByRole('button', { name: 'Fetch Price' }).click();
  await expect(page.getByRole('button', { name: 'Execute Trade' })).toBeEnabled();

  await page.getByRole('button', { name: 'Execute Trade' }).click();

  await expect(page.getByText('Trade #42 executed.')).toBeVisible();
});

test('a rejected trade shows the backend\'s specific error message', async ({ page }) => {
  await mockPrice(page, FAKE_PRICE);
  await mockCreateTrade(page, { message: 'Insufficient USD balance for this trade.' }, 400);
  await page.goto('/');
  await page.getByRole('button', { name: 'Trade', exact: true }).click();
  await page.getByRole('button', { name: 'Fetch Price' }).click();
  await expect(page.getByRole('button', { name: 'Execute Trade' })).toBeEnabled();

  await page.getByRole('button', { name: 'Execute Trade' }).click();

  await expect(page.getByText('Insufficient USD balance for this trade.')).toBeVisible();
});
