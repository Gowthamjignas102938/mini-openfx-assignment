import type { Balance, CreateTradeInput, Price, Trade } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/v1';

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
    headers: { 'Content-Type': 'application/json' },
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

  getBalances: () => request<Balance[]>('/balances'),

  createTrade: (input: CreateTradeInput) =>
    request<Trade>('/trades', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getTradeHistory: (limit: number) =>
    request<Trade[]>(`/trades?limit=${limit}`),
};
