import { IsNumber, IsPositive, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params arrive as strings, unlike CreateTradeDto's JSON body where
 * fromAmount is already a number — @Type(() => Number) is what makes the
 * global ValidationPipe's transform:true actually coerce "100" into 100
 * before @IsNumber() sees it.
 */
export class PreviewTradeDto {
  @IsString()
  @Length(3, 3)
  fromCurrency!: string;

  @IsString()
  @Length(3, 3)
  toCurrency!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  fromAmount!: number;

  @IsString()
  symbol!: string;
}
