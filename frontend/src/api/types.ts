export interface Price {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
  source: 'binance';
}

export interface Balance {
  currency: string;
  amount: string;
  updatedAt: string;
}

export interface Trade {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  createdAt: string;
}

export interface CreateTradeInput {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  symbol: string;
}
