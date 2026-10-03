import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { PaymentStatus } from "../payments/entities/payment.entity";
import { PaymentsService } from "../payments/payments.service";
import { Order, OrderStatus } from "./entities/order.entity";
import { OrdersService } from "./orders.service";

describe("OrdersService", () => {
  const orders = {
    findOne: jest.fn(),
    save: jest.fn(async (order: Order) => order),
  };
  const payments = { create: jest.fn() };
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it("marks an open order as paid when the charge succeeds", async () => {
    orders.findOne.mockResolvedValue({ id: "o-1", status: OrderStatus.Open, totalCents: 1200, paidCents: 0, currency: "usd" });
    payments.create.mockResolvedValue({ id: "p-1", status: PaymentStatus.Succeeded });

    const payment = await service.pay("o-1", "pm_card_visa");

    expect(payment.status).toBe(PaymentStatus.Succeeded);
    expect(payments.create).toHaveBeenCalledWith({
      orderId: "o-1",
      amountCents: 1200,
      currency: "usd",
      paymentMethodId: "pm_card_visa",
    });
    expect(orders.save).toHaveBeenCalledWith(expect.objectContaining({ status: OrderStatus.Paid }));
  });

  it("refuses to pay an order that is not open", async () => {
    orders.findOne.mockResolvedValue({ id: "o-2", status: OrderStatus.Cancelled, totalCents: 500, paidCents: 0, currency: "eur" });

    await expect(service.pay("o-2", "pm_card_visa")).rejects.toThrow("Order o-2 is cancelled");
    expect(payments.create).not.toHaveBeenCalled();
  });
});
