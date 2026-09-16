import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field check: rejects a property equal to another named property on
 * the same object (e.g. toCurrency === fromCurrency). Shared by every DTO
 * that carries a fromCurrency/toCurrency pair — CreateTradeDto and
 * PreviewTradeDto both use it, so a same-currency request is rejected with
 * the same clear, specific message at the validation layer no matter which
 * endpoint it hits, rather than falling through to TradesService's generic
 * "Cannot determine trade direction" error on only one of the two.
 *
 * Not just a UX nicety for CreateTradeDto specifically: a same-currency
 * trade previously reached TradesService's transaction, where reading
 * toBalance before debiting fromBalance let the credit write silently
 * clobber the debit (see trades.service.ts). Rejecting it here means that
 * entire class of trade can never reach the transaction in the first place.
 */
export function IsDifferentCurrency(property: string, validationOptions?: ValidationOptions) {
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
