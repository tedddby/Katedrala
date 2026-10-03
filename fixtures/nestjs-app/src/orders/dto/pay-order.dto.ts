import { IsString, Length } from "class-validator";

export class PayOrderDto {
  /** Stripe PaymentMethod id, e.g. `pm_card_visa`. */
  @IsString()
  @Length(3, 255)
  paymentMethodId: string;
}
