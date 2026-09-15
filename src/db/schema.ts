import { pgTable, varchar, numeric, serial, timestamp } from 'drizzle-orm/pg-core';

export const balances = pgTable('balances', {
  currency: varchar('currency', { length: 3 }).primaryKey(),
  amount: numeric('amount', { precision: 18, scale: 6 }).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
  toCurrency: varchar('to_currency', { length: 3 }).notNull(),
  fromAmount: numeric('from_amount', { precision: 18, scale: 6 }).notNull(),
  toAmount: numeric('to_amount', { precision: 18, scale: 6 }).notNull(),
  rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
