import { created, ok, requireArray, requireNumber, requireString, type Router } from "@/shared/http";
import { OrderService } from "../services/order.service";

export class OrderController {
  constructor(private readonly orders: OrderService) {}

  register(router: Router): void {
    router.post("/orders", async ({ body }) => {
      const lines = requireArray(body, "lines").map((line) => ({
        sku: requireString(line, "sku"),
        description: requireString(line, "description"),
        quantity: requireNumber(line, "quantity"),
        unitPriceCents: requireNumber(line, "unitPriceCents"),
      }));
      const order = await this.orders.createDraft(requireString(body, "customerId"), lines);
      return created(order);
    });

    router.get("/orders/:id", async ({ params }) => ok(await this.orders.get(params.id ?? "")));
    router.post("/orders/:id/checkout", async ({ params }) => ok(await this.orders.checkout(params.id ?? "")));
    router.post("/orders/:id/cancel", async ({ params }) => ok(await this.orders.cancel(params.id ?? "")));
    router.get("/users/:id/orders", async ({ params }) => ok(await this.orders.listForCustomer(params.id ?? "")));
  }
}
