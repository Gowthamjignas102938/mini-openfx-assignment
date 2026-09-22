import type { Page } from '@playwright/test';

// Every helper here stands in for one backend endpoint. Instead of running
// the real NestJS API, we tell the browser "when the app tries to call this
// URL, hand it this fake JSON instead" — so these tests only ever exercise
// frontend code (rendering, state, clicks), never a real server.
//
// We match on the request's pathname (not the full URL with query string,
// and not a glob pattern) because a couple of these paths share a prefix
// with query params attached (e.g. GET /prices?symbol=... vs GET
// /prices/pairs), and Playwright's glob syntax treats "?" as a wildcard
// character, which would make those ambiguous.

function mockJson(page: Page, method: string, matches: (url: URL) => boolean, body: unknown, status = 200) {
  return page.route(
    (url) => matches(url),
    (route) => {
      if (route.request().method() !== method) return route.fallback();
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
}

export const mockTradeablePairs = (page: Page, pairs: unknown[]) =>
  mockJson(page, 'GET', (url) => url.pathname.endsWith('/prices/pairs'), pairs);

export const mockPrice = (page: Page, price: unknown, status = 200) =>
  mockJson(
    page,
    'GET',
    (url) => url.pathname.endsWith('/prices') && url.searchParams.has('symbol'),
    price,
    status,
  );

export const mockBalances = (page: Page, balances: unknown[]) =>
  mockJson(page, 'GET', (url) => url.pathname.endsWith('/balances'), balances);

export const mockCreateTrade = (page: Page, body: unknown, status = 200) =>
  mockJson(page, 'POST', (url) => url.pathname.endsWith('/trades'), body, status);

export const mockPreviewTrade = (page: Page, body: unknown, status = 200) =>
  mockJson(page, 'GET', (url) => url.pathname.endsWith('/trades/preview'), body, status);

export const mockTradeHistory = (page: Page, trades: unknown[]) =>
  mockJson(page, 'GET', (url) => url.pathname.endsWith('/trades'), trades);
