/**
 * The extraction cache contract and an in-memory implementation.
 */
import type { FileExtraction } from "@katedrala/plugin-api";

/**
 * A store of extractions by cache key (see `extractionCacheKey`). Implementations must never throw or reject:
 * failures are misses (`get`) or ignored (`set`).
 */
export interface ExtractionCache {
  /** The extraction stored under `key`, or undefined (a miss). */
  get(key: string): Promise<FileExtraction | undefined>;
  /** Store an extraction under `key`. */
  set(key: string, value: FileExtraction): Promise<void>;
}

/**
 * Whether a value has the shape of a `FileExtraction` (the required fields with the right types). Used to
 * reject corrupt or foreign cache entries and invalid adapter output.
 */
export function isFileExtraction(value: unknown): value is FileExtraction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.moduleFormat === "string" &&
    Array.isArray(record.syntaxErrors) &&
    Array.isArray(record.symbols) &&
    Array.isArray(record.imports) &&
    Array.isArray(record.exports) &&
    Array.isArray(record.references) &&
    Array.isArray(record.facts)
  );
}

/**
 * An {@link ExtractionCache} in memory (per process). Values are copied on `set` and on `get`, so callers can
 * never alter cached entries.
 */
export class MemoryExtractionCache implements ExtractionCache {
  readonly #entries = new Map<string, FileExtraction>();

  /** Number of stored entries. */
  get size(): number {
    return this.#entries.size;
  }

  /** A copy of the stored extraction, or undefined. */
  get(key: string): Promise<FileExtraction | undefined> {
    const value = this.#entries.get(key);
    return Promise.resolve(value === undefined ? undefined : structuredClone(value));
  }

  /** Store a copy of the extraction (values that cannot be cloned are not stored). */
  set(key: string, value: FileExtraction): Promise<void> {
    try {
      this.#entries.set(key, structuredClone(value));
    } catch {
      // Not cloneable (e.g. contains functions): not cacheable.
    }
    return Promise.resolve();
  }

  /** Remove every entry. */
  clear(): void {
    this.#entries.clear();
  }
}
