import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { Decimal } from 'decimal.js';
import { db } from '../db/index.js';
import { balances, trades } from '../db/schema.js';
import { PricesService } from '../prices/prices.service.js';

interface ExecuteTradeInput {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  symbol: string;
}

// Binance has no "USD" asset — its pairs quote against "USDT". This project's
// currency code is "USD", so it needs translating before it can be compared
// against a Binance symbol like "BTCUSDT". Kept separate from
// currency-pairs.ts's TRADEABLE_PAIRS on purpose for now — this map is a
// pure code-translation table, not a statement of which pairs are
// "officially" tradeable — but the two do need to be kept in sync by hand if
// a future pair introduces another asset needing translation.
const CURRENCY_TO_BINANCE_ASSET: Record<string, string> = { USD: 'USDT' };

function toBinanceAsset(currency: string): string {
  return CURRENCY_TO_BINANCE_ASSET[currency] ?? currency;
}

/**
 * A Binance symbol quotes price as "quote-currency units per 1 unit of the
 * base currency" (e.g. BTCUSDT's price is USDT per 1 BTC). Converting
 * base -> quote multiplies by that price; quote -> base divides. Which one
 * applies depends on which side of the symbol fromCurrency/toCurrency fall
 * on, so it has to be resolved per trade rather than assumed.
 */
function convertAmount(
  fromAmount: Decimal,
  price: number,
  symbol: string,
  fromCurrency: string,
  toCurrency: string,
): Decimal {
  const fromAsset = toBinanceAsset(fromCurrency);
  const toAsset = toBinanceAsset(toCurrency);

  if (symbol === `${fromAsset}${toAsset}`) {
    return fromAmount.times(price);
  }
  if (symbol === `${toAsset}${fromAsset}`) {
    return fromAmount.dividedBy(price);
  }

  throw new BadRequestException(
    `Cannot determine trade direction: symbol "${symbol}" does not match currency pair ${fromCurrency}/${toCurrency}`,
  );
}

@Injectable()
export class TradesService {
  constructor(private readonly pricesService: PricesService) {}

  async executeTrade(input: ExecuteTradeInput) {
    const { fromCurrency, toCurrency, fromAmount, symbol } = input;

    const price = await this.pricesService.getCachedPriceOnly(symbol);
    if (!price) {
      throw new ConflictException(
        `No valid cached price for "${symbol}" — fetch a fresh price first`,
      );
    }

    const fromAmountDecimal = new Decimal(fromAmount);

    return db.transaction(async (tx) => {
      // Lock both balance rows together, in one statement, in a fixed
      // (alphabetical-by-currency) order — not the from/to order, which
      // flips depending on trade direction. Two concurrent trades on the
      // same currency pair in opposite directions (e.g. USD->INR and
      // INR->USD) would deadlock if each locked its own "from" currency
      // first; locking in a currency-code order that's the same regardless
      // of direction means every transaction touching this pair always
      // requests the locks in the same sequence, so there's no circular
      // wait. This single locked read also replaces the old two-separate-
      // reads pattern that let the same-currency bug happen in the first
      // place (reading toBalance before writing fromBalance) — both rows
      // are read and locked together, before either is written.
      const [currencyA, currencyB] = [fromCurrency, toCurrency].sort();
      const lockedBalances = await tx
        .select()
        .from(balances)
        .where(inArray(balances.currency, [currencyA, currencyB]))
        .orderBy(balances.currency)
        .for('update');

      const fromBalance = lockedBalances.find((b) => b.currency === fromCurrency);
      const toBalance = lockedBalances.find((b) => b.currency === toCurrency);

      if (!fromBalance) {
        throw new BadRequestException(`Unknown currency "${fromCurrency}"`);
      }
      if (!toBalance) {
        throw new BadRequestException(`Unknown currency "${toCurrency}"`);
      }

      const toAmountDecimal = convertAmount(
        fromAmountDecimal,
        price.bid,
        price.symbol,
        fromCurrency,
        toCurrency,
      );

      const currentFromAmount = new Decimal(fromBalance.amount);
      if (currentFromAmount.lessThan(fromAmountDecimal)) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance: have ${currentFromAmount}, need ${fromAmountDecimal}`,
        );
      }
      const currentToAmount = new Decimal(toBalance.amount);

      await tx
        .update(balances)
        .set({
          amount: currentFromAmount.minus(fromAmountDecimal).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(balances.currency, fromCurrency));

      await tx
        .update(balances)
        .set({
          amount: currentToAmount.plus(toAmountDecimal).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(balances.currency, toCurrency));

      const [trade] = await tx
        .insert(trades)
        .values({
          fromCurrency,
          toCurrency,
          fromAmount: fromAmountDecimal.toFixed(6),
          toAmount: toAmountDecimal.toFixed(6),
          rate: new Decimal(price.bid).toFixed(8),
        })
        .returning();

      return trade;
    });
  }

  // Read-only mirror of executeTrade()'s pricing step: same cached-price
  // lookup, same 409 on a miss, same convertAmount() math — but no
  // transaction, no row locks, and no database access at all, since there's
  // nothing here that needs to be atomic or persisted. Used to show a live
  // "you'll get ~X" estimate while the person is still typing an amount.
  async previewTrade(input: ExecuteTradeInput) {
    const { fromCurrency, toCurrency, fromAmount, symbol } = input;

    const price = await this.pricesService.getCachedPriceOnly(symbol);
    if (!price) {
      throw new ConflictException(
        `No valid cached price for "${symbol}" — fetch a fresh price first`,
      );
    }

    const fromAmountDecimal = new Decimal(fromAmount);
    const toAmountDecimal = convertAmount(
      fromAmountDecimal,
      price.bid,
      price.symbol,
      fromCurrency,
      toCurrency,
    );

    return {
      fromAmount: fromAmountDecimal.toFixed(6),
      toAmount: toAmountDecimal.toFixed(6),
      rate: new Decimal(price.bid).toFixed(8),
      symbol: price.symbol,
    };
  }

  async getTradeHistory(limit: number) {
    return db.select().from(trades).orderBy(desc(trades.id)).limit(limit);
  }
}
