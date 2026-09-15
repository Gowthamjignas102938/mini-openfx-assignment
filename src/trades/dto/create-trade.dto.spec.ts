import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTradeDto } from './create-trade.dto.js';

describe('CreateTradeDto', () => {
  it('rejects fromCurrency === toCurrency', async () => {
    const dto = plainToInstance(CreateTradeDto, {
      fromCurrency: 'USD',
      toCurrency: 'USD',
      fromAmount: 100,
      symbol: 'BTCUSDT',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('toCurrency must be different from fromCurrency');
  });

  it('accepts fromCurrency !== toCurrency', async () => {
    const dto = plainToInstance(CreateTradeDto, {
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: 100,
      symbol: 'BTCUSDT',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
