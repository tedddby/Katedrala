import sendgrid from "@sendgrid/mail";

export class EmailAdapter {
  constructor(
    apiKey: string,
    private readonly from = "orders@shop.example.com",
  ) {
    sendgrid.setApiKey(apiKey);
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await sendgrid.send({ to, from: this.from, subject, html });
  }
}
