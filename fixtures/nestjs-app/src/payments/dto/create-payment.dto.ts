import { IsIn, IsInt, IsString, IsUUID, Length, Min } from "class-validator";
import { MINIMUM_CHARGE_CENTS, SUPPORTED_CURRENCIES } from "../../common/currency";

export class CreatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsInt()
  @Min(MINIMUM_CHARGE_CENTS)
  amountCents: number;

  @IsIn(SUPPORTED_CURRENCIES)
  currency: string;

  /** Stripe PaymentMethod id, e.g. `pm_card_visa`. */
  @IsString()
  @Length(3, 255)
  paymentMethodId: string;
}
