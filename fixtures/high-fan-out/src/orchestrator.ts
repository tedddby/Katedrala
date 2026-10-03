import { AuditAdapter } from "./adapters/audit.adapter";
import { CrmAdapter } from "./adapters/crm.adapter";
import { DhlAdapter } from "./adapters/dhl.adapter";
import { EmailAdapter } from "./adapters/email.adapter";
import { ErpAdapter } from "./adapters/erp.adapter";
import { PaypalAdapter } from "./adapters/paypal.adapter";
import { SmsAdapter } from "./adapters/sms.adapter";
import { StripeAdapter } from "./adapters/stripe.adapter";
import { UpsAdapter } from "./adapters/ups.adapter";
import { WarehouseAdapter } from "./adapters/warehouse.adapter";
import { DiscountService } from "./services/discount.service";
import { FraudService } from "./services/fraud.service";
import { InventoryService } from "./services/inventory.service";
import { InvoiceService } from "./services/invoice.service";
import { LoyaltyService } from "./services/loyalty.service";
import { NotificationService } from "./services/notification.service";
import { PaymentService } from "./services/payment.service";
import { PricingService } from "./services/pricing.service";
import { ShippingService } from "./services/shipping.service";
import { TaxService } from "./services/tax.service";

export interface OrchestratorSettings {
  stripeSecretKey: string;
  paypalClientId: string;
  paypalSecret: string;
  dhlApiKey: string;
  upsAccessToken: string;
  warehouseUrl: string;
  erpUrl: string;
  crmUrl: string;
  sendgridApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  smsSender: string;
  auditLogPath: string;
}

export interface FulfillmentRequest {
  orderId: string;
  customerId: string;
  email: string;
  phone?: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  couponCode?: string;
  paymentMethod: "card" | "paypal";
  paymentToken: string;
  lines: Array<{ sku: string; quantity: number }>;
}

export type FulfillmentResult =
  | { status: "fulfilled"; orderId: string; invoiceNumber: string; trackingNumber: string; totalCents: number }
  | { status: "rejected"; orderId: string; reason: string };

interface Collaborators {
  inventory: InventoryService;
  pricing: PricingService;
  tax: TaxService;
  discounts: DiscountService;
  fraud: FraudService;
  payments: PaymentService;
  shipping: ShippingService;
  invoices: InvoiceService;
  loyalty: LoyaltyService;
  notifications: NotificationService;
  warehouse: WarehouseAdapter;
  erp: ErpAdapter;
  audit: AuditAdapter;
}

export class FulfillmentOrchestrator {
  constructor(private readonly deps: Collaborators) {}

  static create(settings: OrchestratorSettings): FulfillmentOrchestrator {
    const warehouse = new WarehouseAdapter(settings.warehouseUrl);
    const erp = new ErpAdapter(settings.erpUrl);
    const crm = new CrmAdapter(settings.crmUrl);

    return new FulfillmentOrchestrator({
      inventory: new InventoryService(warehouse),
      pricing: new PricingService(erp),
      tax: new TaxService(),
      discounts: new DiscountService(crm),
      fraud: new FraudService(),
      payments: new PaymentService(
        new StripeAdapter(settings.stripeSecretKey),
        new PaypalAdapter(settings.paypalClientId, settings.paypalSecret),
      ),
      shipping: new ShippingService(new DhlAdapter(settings.dhlApiKey), new UpsAdapter(settings.upsAccessToken)),
      invoices: new InvoiceService(erp),
      loyalty: new LoyaltyService(crm),
      notifications: new NotificationService(
        new EmailAdapter(settings.sendgridApiKey),
        new SmsAdapter(settings.twilioAccountSid, settings.twilioAuthToken, settings.smsSender),
      ),
      warehouse,
      erp,
      audit: new AuditAdapter(settings.auditLogPath),
    });
  }

  async fulfill(request: FulfillmentRequest): Promise<FulfillmentResult> {
    const { orderId } = request;
    await this.deps.audit.record("fulfillment.started", { orderId });

    const risk = this.deps.fraud.assess({
      email: request.email,
      hasPhone: request.phone !== undefined,
      lineCount: request.lines.length,
      totalQuantity: request.lines.reduce((sum, line) => sum + line.quantity, 0),
      paymentMethod: request.paymentMethod,
    });
    if (risk.decision === "reject") {
      return this.reject(request, `risk score ${risk.score}`);
    }

    const reservation = await this.deps.inventory.reserve(orderId, request.lines);
    if (!reservation.ok) {
      return this.reject(request, `out of stock: ${reservation.missing.join(", ")}`);
    }

    try {
      const priced = await this.deps.pricing.price(request.lines);
      const discount = await this.deps.discounts.discountFor(request.customerId, priced.subtotalCents, request.couponCode);
      const netCents = priced.subtotalCents - discount.amountCents;
      const tax = this.deps.tax.compute(netCents, request.country);
      const totalCents = netCents + tax.amountCents;

      const payment = await this.deps.payments.collect(request.paymentMethod, request.paymentToken, totalCents, orderId);
      const shipment = await this.deps.shipping.book(
        orderId,
        { street: request.street, city: request.city, postalCode: request.postalCode, country: request.country },
        priced.weightGrams,
      );
      await this.deps.warehouse.createPickList(orderId, request.lines, shipment.carrier);

      const invoice = await this.deps.invoices.issue({
        orderId,
        customerId: request.customerId,
        netCents,
        taxCents: tax.amountCents,
        taxRate: tax.rate,
        paymentReference: payment.reference,
      });
      await this.deps.erp.recordSale(orderId, totalCents, invoice.number);

      const loyalty = await this.deps.loyalty.award(request.customerId, totalCents);
      await this.deps.notifications.orderConfirmed({
        email: request.email,
        phone: request.phone,
        orderId,
        trackingNumber: shipment.trackingNumber,
        totalCents,
        points: loyalty.awarded,
      });

      await this.deps.audit.record("fulfillment.completed", { orderId, totalCents, risk: risk.score });
      return {
        status: "fulfilled",
        orderId,
        invoiceNumber: invoice.number,
        trackingNumber: shipment.trackingNumber,
        totalCents,
      };
    } catch (error) {
      await this.deps.inventory.release(reservation.id);
      await this.deps.audit.record("fulfillment.failed", { orderId, error: String(error) });
      throw error;
    }
  }

  private async reject(request: FulfillmentRequest, reason: string): Promise<FulfillmentResult> {
    await this.deps.notifications.orderRejected(request.email, request.orderId);
    await this.deps.audit.record("fulfillment.rejected", { orderId: request.orderId, reason });
    return { status: "rejected", orderId: request.orderId, reason };
  }
}
