/**
 * Small concurrency primitives. They bound how much work is in flight; they never decide output order (every
 * caller assembles results by index or path).
 */

/** A counting semaphore that grants slots in request order. */
export class Limiter {
  #available: number;
  readonly #waiting: Array<() => void> = [];

  /** @param limit - maximum number of concurrently held slots (at least 1). */
  constructor(limit: number) {
    this.#available = Math.max(1, Math.floor(limit));
  }

  /** Wait for a free slot. Every successful `acquire` must be paired with one {@link release}. */
  acquire(): Promise<void> {
    if (this.#available > 0) {
      this.#available--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#waiting.push(resolve);
    });
  }

  /** Return a slot, handing it to the longest-waiting caller if there is one. */
  release(): void {
    const next = this.#waiting.shift();
    if (next === undefined) this.#available++;
    else next();
  }

  /** Run a task while holding a slot. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

/**
 * Map over items with at most `limit` calls in flight. Results are in input order regardless of completion
 * order. Rejects with the first failure; no new items are started after a failure.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const work = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: workers }, work));
  return results;
}
