import { HttpClient } from "./http-client";

export interface PaypalCapture {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PENDING";
}

export class PaypalAdapter {
  private readonly http: HttpClient;

  constructor(clientId: string, secret: string, baseUrl = "https://api-m.paypal.com") {
    const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
    this.http = new HttpClient({ baseUrl, headers: { authorization: `Basic ${credentials}` } });
  }

  async capture(paypalOrderId: string, orderId: string): Promise<PaypalCapture> {
    return this.http.post<PaypalCapture>(`/v2/checkout/orders/${paypalOrderId}/capture`, { invoice_id: orderId });
  }
}
