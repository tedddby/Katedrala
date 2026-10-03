import type { EmailAdapter } from "../adapters/email.adapter";
import type { SmsAdapter } from "../adapters/sms.adapter";

export interface OrderConfirmation {
  email: string;
  phone?: string;
  orderId: string;
  trackingNumber: string;
  totalCents: number;
  points: number;
}

function formatEuros(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

export class NotificationService {
  constructor(
    private readonly email: EmailAdapter,
    private readonly sms: SmsAdapter,
  ) {}

  async orderConfirmed(confirmation: OrderConfirmation): Promise<void> {
    await this.email.send(
      confirmation.email,
      `Order ${confirmation.orderId} confirmed`,
      [
        `<p>Thank you for your order. Total: ${formatEuros(confirmation.totalCents)}.</p>`,
        `<p>Tracking number: ${confirmation.trackingNumber}</p>`,
        `<p>You earned ${confirmation.points} loyalty points.</p>`,
      ].join(""),
    );
    if (confirmation.phone !== undefined) {
      await this.sms.send(confirmation.phone, `Order ${confirmation.orderId} is on its way: ${confirmation.trackingNumber}`);
    }
  }

  async orderRejected(email: string, orderId: string): Promise<void> {
    await this.email.send(
      email,
      `Order ${orderId} could not be completed`,
      "<p>We could not complete your order. No payment has been taken. Our support team will contact you.</p>",
    );
  }
}
