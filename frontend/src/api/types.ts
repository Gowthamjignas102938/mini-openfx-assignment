export interface Price {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
  source: 'binance';
}

export interface TradeablePair {
  symbol: string;
  base: string;
  quote: string;
  bid: number;
  ask: number;
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

export interface TradePreview {
  fromAmount: string;
  toAmount: string;
  rate: string;
  symbol: string;
}
