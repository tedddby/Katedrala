/**
 * A persistent extraction cache in a directory, safe to share between concurrent processes.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { threadId } from "node:worker_threads";
import { silentLogger, type FileExtraction, type Logger } from "@katedrala/plugin-api";
import { errorMessage } from "../util/diagnostics.js";
import { isFileExtraction, type ExtractionCache } from "./cache.js";
import { CACHE_FORMAT_VERSION, isExtractionCacheKey } from "./key.js";

/** The JSON stored in each cache file. */
interface CacheEntry {
  format: number;
  key: string;
  extraction: FileExtraction;
}

/** Options of {@link FileSystemExtractionCache}. */
export interface FileSystemExtractionCacheOptions {
  /** Receives cache I/O problems (default: silent). Cache problems never fail an analysis. */
  logger?: Logger;
}

/** Distinguishes temporary files written by this process and thread. */
let temporaryCounter = 0;

/**
 * An {@link ExtractionCache} storing one JSON file per entry at `<dir>/<key[0..2]>/<key>.json`.
 *
 * - Writes are atomic: an entry is written to a temporary file in the same directory and renamed into place,
 *   so readers never observe a partial entry. Concurrent writers of the same key write identical content;
 *   whichever rename lands last wins.
 * - Reads validate the entry (format version, key and extraction shape); corrupt or foreign entries are
 *   misses (and are overwritten by the next `set`).
 * - I/O errors never throw: `get` misses, `set` does nothing, and the logger is told.
 */
export class FileSystemExtractionCache implements ExtractionCache {
  /** The cache directory. */
  readonly directory: string;
  readonly #logger: Logger;

  constructor(directory: string, options: FileSystemExtractionCacheOptions = {}) {
    this.directory = directory;
    this.#logger = options.logger ?? silentLogger;
  }

  /** The file holding the entry of a (well-formed) key. */
  entryPath(key: string): string {
    return join(this.directory, key.slice(0, 2), `${key}.json`);
  }

  /** The stored extraction, or undefined when absent, unreadable or corrupt. */
  async get(key: string): Promise<FileExtraction | undefined> {
    if (!isExtractionCacheKey(key)) return undefined;
    const path = this.entryPath(key);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.#logger.debug("Cannot read an extraction cache entry", {
          path,
          error: errorMessage(error),
        });
      }
      return undefined;
    }
    try {
      const entry = JSON.parse(text) as Partial<CacheEntry> | null;
      if (
        entry !== null &&
        entry.format === CACHE_FORMAT_VERSION &&
        entry.key === key &&
        isFileExtraction(entry.extraction)
      ) {
        return entry.extraction;
      }
    } catch {
      // Corrupt JSON: treated as a miss below.
    }
    this.#logger.debug("Ignoring a corrupt extraction cache entry", { path });
    return undefined;
  }

  /** Store an extraction atomically; failures are logged and otherwise ignored. */
  async set(key: string, value: FileExtraction): Promise<void> {
    if (!isExtractionCacheKey(key)) {
      this.#logger.warn("Ignoring an extraction cache write with a malformed key", { key });
      return;
    }
    const path = this.entryPath(key);
    const temporary = `${path}.${process.pid}-${threadId}-${++temporaryCounter}.tmp`;
    let text: string;
    try {
      const entry: CacheEntry = { format: CACHE_FORMAT_VERSION, key, extraction: value };
      text = JSON.stringify(entry);
    } catch (error) {
      this.#logger.debug("Cannot serialize an extraction for the cache", {
        error: errorMessage(error),
      });
      return;
    }
    try {
      await mkdir(join(this.directory, key.slice(0, 2)), { recursive: true });
      await writeFile(temporary, text, "utf8");
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      // Windows refuses to replace a file another process holds open; an entry is then already in place.
      if (await isFile(path)) return;
      this.#logger.warn("Cannot write an extraction cache entry", {
        path,
        error: errorMessage(error),
      });
    }
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
