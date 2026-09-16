import type {
  Balance,
  CreateTradeInput,
  Price,
  Trade,
  TradeablePair,
  TradePreview,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/v1';

/**
 * Every /v1/* route now requires this header (see ApiKeyGuard on the
 * backend). Baked in at build time via Vite — which means it's genuinely
 * not a secret once this bundle ships: anyone can read it out of the
 * browser's network tab or the built JS. Acceptable for this project's
 * scope (a single shared secret, no real per-user accounts either way) —
 * see README's "Design decisions & trade-offs" for the honest version of
 * this trade-off.
 */
const API_KEY = import.meta.env.VITE_API_KEY ?? '';

/**
 * Every 4xx/5xx from the backend is { message, error, statusCode } — message
 * is a plain string for business-logic errors (e.g. "Insufficient USD
 * balance...", "No valid cached price...") and a string[] for
 * class-validator failures. Normalized to one readable string here so every
 * view can just show err.message without re-deriving this each time.
 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : (rawMessage ?? `Request failed with status ${response.status}`);
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getPrice: (symbol: string) =>
    request<Price>(`/prices?symbol=${encodeURIComponent(symbol)}`),

  getTradeablePairs: () => request<TradeablePair[]>('/prices/pairs'),

  getBalances: () => request<Balance[]>('/balances'),

  createTrade: (input: CreateTradeInput) =>
    request<Trade>('/trades', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  previewTrade: (input: CreateTradeInput) => {
    const params = new URLSearchParams({
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      fromAmount: String(input.fromAmount),
      symbol: input.symbol,
    });
    return request<TradePreview>(`/trades/preview?${params.toString()}`);
  },

  getTradeHistory: (limit: number) =>
    request<Trade[]>(`/trades?limit=${limit}`),
};
