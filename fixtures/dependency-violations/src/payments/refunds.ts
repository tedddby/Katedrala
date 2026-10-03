import type { PaymentGateway } from "./payment-gateway";

export interface RefundRecord {
  chargeId: string;
  amountCents: number;
  reason: string;
  refundedAt: Date;
}

export class RefundProcessor {
  private readonly history: RefundRecord[] = [];

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly maxRefundCents = 50_000,
  ) {}

  async refund(chargeId: string, amountCents: number, reason: string): Promise<RefundRecord> {
    if (amountCents <= 0) {
      throw new Error("Refund amount must be positive");
    }
    if (amountCents > this.maxRefundCents) {
      throw new Error(`Refunds above ${this.maxRefundCents} cents need manual approval`);
    }
    await this.gateway.refund(chargeId, amountCents);
    const record: RefundRecord = { chargeId, amountCents, reason, refundedAt: new Date() };
    this.history.push(record);
    return record;
  }

  refundsFor(chargeId: string): RefundRecord[] {
    return this.history.filter((record) => record.chargeId === chargeId);
  }
}
