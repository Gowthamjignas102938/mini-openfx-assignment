import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
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

    const toAmount = fromAmount * price.bid;

    return db.transaction(async (tx) => {
      const [fromBalance] = await tx
        .select()
        .from(balances)
        .where(eq(balances.currency, fromCurrency));

      if (!fromBalance) {
        throw new BadRequestException(`Unknown currency "${fromCurrency}"`);
      }

      const currentFromAmount = Number(fromBalance.amount);
      if (currentFromAmount < fromAmount) {
        throw new BadRequestException(
          `Insufficient ${fromCurrency} balance: have ${currentFromAmount}, need ${fromAmount}`,
        );
      }

      const [toBalance] = await tx
        .select()
        .from(balances)
        .where(eq(balances.currency, toCurrency));

      if (!toBalance) {
        throw new BadRequestException(`Unknown currency "${toCurrency}"`);
      }

      await tx
        .update(balances)
        .set({
          amount: String(currentFromAmount - fromAmount),
          updatedAt: new Date(),
        })
        .where(eq(balances.currency, fromCurrency));

      await tx
        .update(balances)
        .set({
          amount: String(Number(toBalance.amount) + toAmount),
          updatedAt: new Date(),
        })
        .where(eq(balances.currency, toCurrency));

      const [trade] = await tx
        .insert(trades)
        .values({
          fromCurrency,
          toCurrency,
          fromAmount: String(fromAmount),
          toAmount: String(toAmount),
          rate: String(price.bid),
        })
        .returning();

      return trade;
    });
  }

  async getTradeHistory(limit: number) {
    return db.select().from(trades).orderBy(desc(trades.id)).limit(limit);
  }
}
