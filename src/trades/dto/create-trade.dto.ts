import { IsNumber, IsPositive, IsString, Length } from 'class-validator';
import { IsDifferentCurrency } from '../../common/validators/is-different-currency.validator.js';

export class CreateTradeDto {
  @IsString()
  @Length(3, 3)
  fromCurrency!: string;

  @IsString()
  @Length(3, 3)
  @IsDifferentCurrency('fromCurrency', {
    message: 'toCurrency must be different from fromCurrency',
  })
  toCurrency!: string;

  @IsNumber()
  @IsPositive()
  fromAmount!: number;

  @IsString()
  symbol!: string;
}
