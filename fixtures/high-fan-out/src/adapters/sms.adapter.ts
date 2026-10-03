import twilio from "twilio";

export class SmsAdapter {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly sender: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async send(to: string, body: string): Promise<string> {
    const message = await this.client.messages.create({ to, from: this.sender, body });
    return message.sid;
  }
}
