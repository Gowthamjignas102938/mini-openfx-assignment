import {
  IsNumber,
  IsPositive,
  IsString,
  Length,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field check: rejects toCurrency === fromCurrency at the validation
 * layer. Not just a UX nicety — a same-currency trade previously reached
 * TradesService's transaction, where reading toBalance before debiting
 * fromBalance let the credit write silently clobber the debit (see
 * trades.service.ts). Rejecting it here means that entire class of trade
 * can never reach the transaction in the first place.
 */
function IsDifferentCurrency(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDifferentCurrency',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value !== relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be different from ${args.constraints[0]}`;
        },
      },
    });
  };
}

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
