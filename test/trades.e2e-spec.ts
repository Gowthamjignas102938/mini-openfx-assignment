/**
 * Regression test for the same-currency money-mint bug found by an
 * independent adversarial review: TradesService used to read toBalance
 * before debiting fromBalance, so a fromCurrency === toCurrency trade
 * silently erased the debit while still applying the credit. Fixed at the
 * validation layer (CreateTradeDto's IsDifferentCurrency check) — this test
 * goes through the real HTTP stack (ValidationPipe included, not just the
 * service directly) to prove the request never reaches TradesService at
 * all, and that the balance genuinely never moves.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/bootstrap.js';
import { db } from './../src/db/index.js';
import { balances, trades } from './../src/db/schema.js';

describe('Trades (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await db.$client.end();
  });

  it('rejects a same-currency trade with 400 and makes no balance change', async () => {
    await db
      .insert(balances)
      .values({ currency: 'USD', amount: '1000.000000' })
      .onConflictDoUpdate({
        target: balances.currency,
        set: { amount: '1000.000000', updatedAt: new Date() },
      });
    const tradeCountBefore = (await db.select().from(trades)).length;

    const response = await request(app.getHttpServer())
      .post('/v1/trades')
      .send({ fromCurrency: 'USD', toCurrency: 'USD', fromAmount: 100, symbol: 'BTCUSDT' })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain(
      'toCurrency must be different from fromCurrency',
    );

    const [row] = await db.select().from(balances).where(eq(balances.currency, 'USD'));
    expect(row.amount).toBe('1000.000000');

    const tradeCountAfter = (await db.select().from(trades)).length;
    expect(tradeCountAfter).toBe(tradeCountBefore);
  });
});
