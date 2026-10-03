import { ok, type Router } from "@/shared/http";
import { PaymentService } from "../services/payment.service";

export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  register(router: Router): void {
    router.get("/orders/:id/payments", async ({ params }) => ok(await this.payments.listForOrder(params.id ?? "")));
    router.post("/payments/:id/refund", async ({ params }) => ok(await this.payments.refund(params.id ?? "")));
  }
}
