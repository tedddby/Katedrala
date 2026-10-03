import { createEvent, type EventName, type EventProperties, type TrackedEvent } from "./events";

export class Tracker {
  private buffer: TrackedEvent[] = [];

  constructor(
    private readonly endpoint: string,
    private readonly batchSize = 20,
  ) {}

  track(name: EventName, properties: EventProperties = {}): void {
    this.buffer.push(createEvent(name, properties));
    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Analytics must never break the request path: drop the batch.
    }
  }
}

/** Process-wide tracker used by request handlers and background code. */
export const tracker = new Tracker(process.env.ANALYTICS_ENDPOINT ?? "https://collector.example.com/v1/events");

export function track(name: EventName, properties?: EventProperties): void {
  tracker.track(name, properties);
}
