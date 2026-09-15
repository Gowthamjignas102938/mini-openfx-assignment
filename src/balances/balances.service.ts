import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { balances } from '../db/schema.js';

@Injectable()
export class BalancesService {
  async getAllBalances() {
    return db.select().from(balances);
  }

  async getBalance(currency: string) {
    const rows = await db.select().from(balances).where(eq(balances.currency, currency));
    return rows[0];
  }
}
