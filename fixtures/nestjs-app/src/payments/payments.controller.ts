import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiKeyGuard } from "../common/guards/api-key.guard";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import type { Payment } from "./entities/payment.entity";
import { PaymentsService } from "./payments.service";

@Controller("payments")
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findByOrder(@Query("orderId", ParseUUIDPipe) orderId: string): Promise<Payment[]> {
    return this.paymentsService.findByOrder(orderId);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string): Promise<Payment> {
    return this.paymentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePaymentDto): Promise<Payment> {
    return this.paymentsService.create(dto);
  }
}
