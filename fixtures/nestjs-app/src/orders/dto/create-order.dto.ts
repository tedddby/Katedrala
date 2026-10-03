import { IsIn, IsInt, IsUUID, Min } from "class-validator";
import { MINIMUM_CHARGE_CENTS, SUPPORTED_CURRENCIES } from "../../common/currency";

export class CreateOrderDto {
  @IsUUID()
  customerId: string;

  @IsInt()
  @Min(MINIMUM_CHARGE_CENTS)
  totalCents: number;

  @IsIn(SUPPORTED_CURRENCIES)
  currency: string;
}
