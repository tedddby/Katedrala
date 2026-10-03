import { FulfillmentOrchestrator, type FulfillmentRequest, type OrchestratorSettings } from "./orchestrator";

interface QueueEvent {
  Records: Array<{ messageId: string; body: string }>;
}

interface BatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function settingsFromEnv(): OrchestratorSettings {
  return {
    stripeSecretKey: env("STRIPE_SECRET_KEY"),
    paypalClientId: env("PAYPAL_CLIENT_ID"),
    paypalSecret: env("PAYPAL_SECRET"),
    dhlApiKey: env("DHL_API_KEY"),
    upsAccessToken: env("UPS_ACCESS_TOKEN"),
    warehouseUrl: env("WAREHOUSE_URL"),
    erpUrl: env("ERP_URL"),
    crmUrl: env("CRM_URL"),
    sendgridApiKey: env("SENDGRID_API_KEY"),
    twilioAccountSid: env("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: env("TWILIO_AUTH_TOKEN"),
    smsSender: env("SMS_SENDER"),
    auditLogPath: process.env.AUDIT_LOG_PATH ?? "/tmp/fulfillment-audit.log",
  };
}

let orchestrator: FulfillmentOrchestrator | undefined;

/** Queue-triggered entry point: one message per paid order; failed messages are retried by the queue. */
export async function handler(event: QueueEvent): Promise<BatchResponse> {
  orchestrator ??= FulfillmentOrchestrator.create(settingsFromEnv());
  const batchItemFailures: BatchResponse["batchItemFailures"] = [];
  for (const record of event.Records) {
    try {
      const request = JSON.parse(record.body) as FulfillmentRequest;
      await orchestrator.fulfill(request);
    } catch (error) {
      console.error(`fulfillment of message ${record.messageId} failed`, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
