import { createLogger } from "../core/logger";

const log = createLogger("storage.cache");

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private hits = 0;
  private misses = 0;

  constructor(
    readonly name: string,
    private readonly ttlMs: number,
    private readonly maxEntries = 1_000,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined || entry.expiresAt <= Date.now()) {
      this.misses++;
      if (entry !== undefined) this.entries.delete(key);
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
      log.debug("evicted oldest entry", { cache: this.name, key: oldest });
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  stats(): { name: string; size: number; hits: number; misses: number } {
    return { name: this.name, size: this.entries.size, hits: this.hits, misses: this.misses };
  }

  clear(): void {
    log.info("cleared", this.stats());
    this.entries.clear();
  }
}
