import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import type { Payment } from "../payments/entities/payment.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { PayOrderDto } from "./dto/pay-order.dto";
import type { Order } from "./entities/order.entity";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query("customerId") customerId?: string): Promise<Order[]> {
    return this.ordersService.findAll(customerId);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }

  @Post(":id/pay")
  @HttpCode(HttpStatus.OK)
  pay(@Param("id", ParseUUIDPipe) id: string, @Body() body: PayOrderDto): Promise<Payment> {
    return this.ordersService.pay(id, body.paymentMethodId);
  }

  @Delete(":id")
  cancel(@Param("id", ParseUUIDPipe) id: string): Promise<Order> {
    return this.ordersService.cancel(id);
  }
}
