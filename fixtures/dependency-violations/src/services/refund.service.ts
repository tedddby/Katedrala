import { orderTotalCents, type Order } from "../domain/order";
import { OrderRepository } from "../repositories/order.repository";
import { RefundProcessor } from "../payments/refunds";
import { Tracker } from "../analytics/tracker";

export class RefundService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly refunds: RefundProcessor,
    private readonly tracker: Tracker,
  ) {}

  async refundOrder(orderId: string, reason: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status !== "paid" || order.paymentId === undefined) {
      throw new Error(`Order ${orderId} cannot be refunded in status ${order.status}`);
    }

    await this.refunds.refund(order.paymentId, orderTotalCents(order), reason);
    const refunded: Order = { ...order, status: "refunded" };
    await this.orders.save(refunded);
    this.tracker.track("refund_issued", { orderId, reason });
    return refunded;
  }
}
