import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class CreateTradeDto {
  @IsString()
  @Length(3, 3)
  fromCurrency!: string;

  @IsString()
  @Length(3, 3)
  toCurrency!: string;

  @IsNumber()
  @IsPositive()
  fromAmount!: number;

  @IsString()
  symbol!: string;
}
