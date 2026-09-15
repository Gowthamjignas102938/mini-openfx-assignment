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
    const toAmountDecimal = fromAmountDecimal.times(price.bid);

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

  async getTradeHistory(limit: number) {
    return db.select().from(trades).orderBy(desc(trades.id)).limit(limit);
  }
}
