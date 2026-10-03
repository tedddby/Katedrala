import type { ErpAdapter } from "../adapters/erp.adapter";

export interface InvoiceInput {
  orderId: string;
  customerId: string;
  netCents: number;
  taxCents: number;
  taxRate: number;
  paymentReference: string;
}

export interface Invoice extends InvoiceInput {
  number: string;
  issuedAt: string;
  totalCents: number;
}

export class InvoiceService {
  constructor(private readonly erp: ErpAdapter) {}

  async issue(input: InvoiceInput): Promise<Invoice> {
    const number = await this.erp.nextInvoiceNumber();
    const invoice: Invoice = {
      ...input,
      number,
      issuedAt: new Date().toISOString(),
      totalCents: input.netCents + input.taxCents,
    };
    await this.erp.bookInvoice({ number, orderId: input.orderId, netCents: input.netCents, taxCents: input.taxCents });
    return invoice;
  }
}
