import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment } from "./entities/payment.entity";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { StripeClient } from "./stripe.client";

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
