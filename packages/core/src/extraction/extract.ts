/**
 * Per-file extraction: reading, normalizing and hashing every discovered file, and parsing the files a
 * language adapter claims (from the cache when possible, in worker threads when there is enough work).
 */
import { availableParallelism } from "node:os";
import { compareStrings, fileId, type Diagnostic, type ToolVersion } from "@katedrala/ir";
import {
  silentLogger,
  type FileExtraction,
  type LanguageAdapter,
  type Logger,
  type ParseInput,
  type SnapshotSource,
} from "@katedrala/plugin-api";
import { isFileExtraction, type ExtractionCache } from "../cache/cache.js";
import { adapterOptionsDigest, extractionCacheKey } from "../cache/key.js";
import { DEFAULT_MAX_FILE_SIZE } from "../config/schema.js";
import { assertUniqueAdapterIds, type DiscoveredFile } from "../discovery/discover.js";
import { isTextLikePath } from "../discovery/languages.js";
import { contentHash, decodeText, lineCount } from "../text/text.js";
import { Limiter } from "../util/concurrency.js";
import { errorMessage, sortDiagnostics } from "../util/diagnostics.js";
import { generatedMarkerLine } from "./generated.js";
import { BATCH_SIZE, ParseScheduler, WORKER_THRESHOLD } from "./scheduler.js";

/** Paths listed at most in one log entry. */
const MAX_LOGGED_PATHS = 20;

/**
 * How a file was handled:
 * - `parsed` / `partial`: an adapter extracted it (`partial` when the parser reported syntax errors);
 * - `skipped`: claimed by an adapter but deliberately not parsed (`reason`: `file-too-large`, `generated`,
 *   `vendored` or `binary`);
 * - `failed`: reading or parsing failed (`reason` explains);
 * - `unsupported`: no adapter handles the file (text-like files are still read for lines and digest).
 */
export type FileStatus = "parsed" | "partial" | "skipped" | "failed" | "unsupported";

/** The outcome of extraction for one file. */
export interface FileOutcome {
  path: string;
  status: FileStatus;
  /** Line count of the normalized text, when the content was read as text. */
  lines?: number;
  /** `sha256:<hex>` of the normalized text, when the content was read as text. */
  hash?: string;
  /** The adapter's extraction (`parsed` and `partial` files). */
  extraction?: FileExtraction;
  /** Why the file was skipped, failed or not read. */
  reason?: string;
  /**
   * Set when the file is generated code: a header comment marks it (see `generatedMarkerLine`), or its role
   * is `generated`.
   */
  generated?: boolean;
  /** The adapter that processed (or failed to process) the file. */
  adapter?: ToolVersion;
}

/** Progress of {@link extractFiles}; `completed` counts files with an outcome. */
export interface ExtractionProgress {
  completed: number;
  total: number;
  /** The file that was just completed. */
  path: string;
}

/** Options of {@link extractFiles}. */
export interface ExtractionOptions {
  /** Extraction cache; without one, every claimed file is parsed. */
  cache?: ExtractionCache;
  /**
   * Maximum worker threads (default `min(availableParallelism() - 1, 8)`, at least 1). Worker threads are
   * used only when this is greater than 1, at least 64 files need parsing and the adapter has a
   * `workerModule`; otherwise files are parsed in the main thread.
   */
  concurrency?: number;
  /** Aborts extraction: `extractFiles` then rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Called after each file's outcome is known (in completion order). */
  onProgress?: (progress: ExtractionProgress) => void;
  /**
   * Receives cache, worker and callback problems, and one `info` entry listing the files a header comment
   * marks as generated code (default: silent).
   */
  logger?: Logger;
  /** URL of the worker entry module (default: `worker-entry.js` next to this module). */
  workerUrl?: string | URL;
  /**
   * Files no adapter claims are read for lines and digest only when text-like and at most this many bytes
   * (default 1048576; pass `max_file_size` from the configuration). Claimed files follow their `skipReason`.
   */
  maxFileSize?: number;
}

/** Statistics of one extraction run (they depend on cache state and the machine, not only on content). */
export interface ExtractionStats {
  /** Files with an outcome. */
  files: number;
  /** Claimed files whose extraction came from the cache. */
  cacheHits: number;
  /** Cache lookups that missed. */
  cacheMisses: number;
  /** Files parsed by an adapter (successfully or not). */
  parsed: number;
  /** Worker threads that started successfully (0: every file was parsed in the main thread). */
  workers: number;
}

/** The result of {@link extractFiles}. */
export interface ExtractionResults {
  /** One outcome per input file, sorted by path. */
  results: FileOutcome[];
  /**
   * Problems met while extracting, in canonical order: `read-failed`, `parse-failed`, `file-too-large` and
   * `plugin-error` (an adapter that cannot be initialized). Syntax errors are not repeated here; they are
   * in each extraction's `syntaxErrors`.
   */
  diagnostics: Diagnostic[];
  stats: ExtractionStats;
}

/** The default number of worker threads: `min(availableParallelism() - 1, 8)`, at least 1. */
export function defaultWorkerCount(): number {
  return Math.max(1, Math.min(availableParallelism() - 1, 8));
}

function defaultWorkerUrl(): URL {
  return new URL("./worker-entry.js", import.meta.url);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * The JSON form of an extraction (what any persistent cache stores), so that results never depend on whether
 * they came from the cache: `NaN` and infinities become `null`, `-0` becomes `0`, `undefined` properties
 * disappear. Fails for values JSON cannot represent (cycles, bigints).
 */
function toJsonExtraction(extraction: FileExtraction): FileExtraction | { error: string } {
  try {
    const normalized = JSON.parse(JSON.stringify(extraction)) as unknown;
    if (isFileExtraction(normalized)) return normalized;
    return { error: "The extraction is not representable as JSON" };
  } catch (error) {
    return { error: `The extraction is not representable as JSON: ${errorMessage(error)}` };
  }
}

function parsedOutcome(
  path: string,
  lines: number,
  hash: string,
  extraction: FileExtraction,
  adapter: ToolVersion,
): FileOutcome {
  const status = extraction.syntaxErrors.length > 0 ? "partial" : "parsed";
  return { path, status, lines, hash, extraction, adapter };
}

/**
 * Extract every discovered file. For files an adapter claims and discovery did not skip, the content is read
 * and normalized (`decodeText`); binary content is `skipped` (`binary`); a header comment marking the file as
 * generated code (see `generatedMarkerLine`) makes it `skipped` (`generated`, with `generated: true`, and
 * listed in one `info` log entry); otherwise the extraction comes from
 * the cache or from the adapter (`init()` is awaited once before first use; `parse` and `extract` may be
 * synchronous or asynchronous) and is cached. Syntax errors make the status `partial`. An adapter exception
 * fails only its file. Files no adapter claims are read for lines and digest when text-like and not larger
 * than `maxFileSize`.
 *
 * The result does not depend on completion order, worker count or cache state: outcomes are assembled by
 * path, diagnostics are sorted, and extractions are always returned in their JSON form (exactly what a
 * persistent cache returns; an extraction JSON cannot represent fails its file).
 *
 * @throws {TypeError} when two files share a path, two adapters share an id, or a file names an adapter that
 *   was not given.
 * @throws the signal's reason when `options.signal` aborts.
 */
export async function extractFiles(
  source: SnapshotSource,
  files: readonly DiscoveredFile[],
  adapters: readonly LanguageAdapter[],
  options: ExtractionOptions = {},
): Promise<ExtractionResults> {
  const { signal, cache } = options;
  signal?.throwIfAborted();
  assertUniqueAdapterIds(adapters);
  const logger = options.logger ?? silentLogger;
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const adaptersById = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const sorted = [...files].sort((a, b) => compareStrings(a.path, b.path));
  sorted.forEach((file, index) => {
    if (index > 0 && sorted[index - 1]?.path === file.path) {
      throw new TypeError(`File listed twice: ${file.path}`);
    }
    if (file.adapterId !== undefined && !adaptersById.has(file.adapterId)) {
      throw new TypeError(`No adapter with id "${file.adapterId}" was given (file ${file.path})`);
    }
  });

  const workers =
    options.concurrency === undefined
      ? defaultWorkerCount()
      : Math.max(1, Math.floor(options.concurrency));
  const workerUrl =
    options.workerUrl === undefined
      ? defaultWorkerUrl()
      : typeof options.workerUrl === "string"
        ? new URL(options.workerUrl)
        : options.workerUrl;
  const scheduler = new ParseScheduler({ adapters, workers, workerUrl, logger, signal });

  const outcomes = new Map<string, FileOutcome>();
  const diagnostics: Diagnostic[] = [];
  const stats: ExtractionStats = { files: 0, cacheHits: 0, cacheMisses: 0, parsed: 0, workers: 0 };
  const failedInitializations = new Set<string>();
  const optionsDigests = new Map<string, string | undefined>();
  /** Files skipped because a header comment marks them as generated, with the comment's line. */
  const markedGenerated: Array<{ path: string; line: number }> = [];

  const optionsDigestOf = (adapter: LanguageAdapter): string | undefined => {
    if (!optionsDigests.has(adapter.id)) {
      try {
        optionsDigests.set(adapter.id, adapterOptionsDigest(adapter.options));
      } catch (error) {
        logger.warn(
          `Options of adapter "${adapter.id}" cannot be digested; its results are not cached`,
          {
            error: errorMessage(error),
          },
        );
        optionsDigests.set(adapter.id, undefined);
      }
    }
    return optionsDigests.get(adapter.id);
  };

  const cacheGet = async (key: string): Promise<FileExtraction | undefined> => {
    try {
      return await cache?.get(key);
    } catch (error) {
      logger.debug("Extraction cache lookup failed", { error: errorMessage(error) });
      return undefined;
    }
  };

  const cacheSet = async (key: string, extraction: FileExtraction): Promise<void> => {
    try {
      await cache?.set(key, extraction);
    } catch (error) {
      logger.debug("Extraction cache write failed", { error: errorMessage(error) });
    }
  };

  const record = (outcome: FileOutcome): void => {
    outcomes.set(outcome.path, outcome);
    if (options.onProgress === undefined) return;
    try {
      options.onProgress({ completed: outcomes.size, total: sorted.length, path: outcome.path });
    } catch (error) {
      logger.warn("An extraction progress callback failed", { error: errorMessage(error) });
    }
  };

  const read = async (file: DiscoveredFile): Promise<Uint8Array | { error: string }> => {
    try {
      return await source.read(file.path);
    } catch (error) {
      return { error: errorMessage(error) };
    }
  };

  const unclaimedOutcome = async (file: DiscoveredFile): Promise<FileOutcome> => {
    if (!isTextLikePath(file.path) || file.size > maxFileSize) {
      return { path: file.path, status: "unsupported" };
    }
    const bytes = await read(file);
    if (!(bytes instanceof Uint8Array)) {
      diagnostics.push({
        code: "read-failed",
        severity: "warning",
        message: `Cannot read the file: ${bytes.error}`,
        file: fileId(file.path),
      });
      return {
        path: file.path,
        status: "unsupported",
        reason: `Cannot read the file: ${bytes.error}`,
      };
    }
    const decoded = decodeText(bytes);
    if (decoded.binary) return { path: file.path, status: "unsupported" };
    return {
      path: file.path,
      status: "unsupported",
      lines: lineCount(decoded.text),
      hash: contentHash(decoded.text),
    };
  };

  const claimedOutcome = async (
    file: DiscoveredFile,
    adapter: LanguageAdapter,
    ready: () => void,
  ): Promise<FileOutcome> => {
    const path = file.path;
    if (file.skipReason === "file-too-large") {
      diagnostics.push({
        code: "file-too-large",
        severity: "warning",
        message: `Not parsed: the file has ${file.size} bytes, more than the maximum file size`,
        file: fileId(path),
      });
      return { path, status: "skipped", reason: "file-too-large" };
    }
    const bytes = await read(file);
    if (!(bytes instanceof Uint8Array)) {
      diagnostics.push({
        code: "read-failed",
        severity: "error",
        message: `Cannot read the file: ${bytes.error}`,
        file: fileId(path),
      });
      return { path, status: "failed", reason: `Cannot read the file: ${bytes.error}` };
    }
    const decoded = decodeText(bytes);
    if (decoded.binary) return { path, status: "skipped", reason: "binary" };
    const text = decoded.text;
    const lines = lineCount(text);
    const hash = contentHash(text);
    if (file.skipReason !== undefined) {
      return file.skipReason === "generated"
        ? { path, status: "skipped", reason: "generated", lines, hash, generated: true }
        : { path, status: "skipped", reason: file.skipReason, lines, hash };
    }
    const markerLine = generatedMarkerLine(text);
    if (markerLine !== undefined) {
      markedGenerated.push({ path, line: markerLine });
      return { path, status: "skipped", reason: "generated", lines, hash, generated: true };
    }

    const tool: ToolVersion = { id: adapter.id, version: adapter.version };
    const optionsDigest = cache === undefined ? undefined : optionsDigestOf(adapter);
    const key =
      optionsDigest === undefined
        ? undefined
        : extractionCacheKey({
            adapterId: adapter.id,
            adapterVersion: adapter.version,
            optionsDigest,
            path,
            language: file.language,
            dialect: file.dialect,
            contentHash: hash,
          });
    if (key !== undefined) {
      const cached = await cacheGet(key);
      if (cached !== undefined && isFileExtraction(cached)) {
        stats.cacheHits++;
        return parsedOutcome(path, lines, hash, cached, tool);
      }
      stats.cacheMisses++;
    }

    signal?.throwIfAborted();
    const input: ParseInput = {
      path,
      text,
      language: file.language,
      ...(file.dialect === undefined ? {} : { dialect: file.dialect }),
    };
    ready();
    const result = await scheduler.submit(adapter, input);
    signal?.throwIfAborted();
    if (!result.ok) {
      if (result.initialization === true) {
        if (!failedInitializations.has(adapter.id)) {
          failedInitializations.add(adapter.id);
          diagnostics.push({ code: "plugin-error", severity: "error", message: result.error });
        }
        return { path, status: "failed", reason: result.error, lines, hash };
      }
      stats.parsed++;
      diagnostics.push({
        code: "parse-failed",
        severity: "error",
        message: `The ${adapter.id} adapter failed: ${result.error}`,
        file: fileId(path),
      });
      return { path, status: "failed", reason: result.error, lines, hash, adapter: tool };
    }
    stats.parsed++;
    const extraction = toJsonExtraction(result.extraction);
    if ("error" in extraction) {
      diagnostics.push({
        code: "parse-failed",
        severity: "error",
        message: `The ${adapter.id} adapter failed: ${extraction.error}`,
        file: fileId(path),
      });
      return { path, status: "failed", reason: extraction.error, lines, hash, adapter: tool };
    }
    if (key !== undefined) await cacheSet(key, extraction);
    return parsedOutcome(path, lines, hash, extraction, tool);
  };

  const processFile = async (file: DiscoveredFile, ready: () => void): Promise<void> => {
    try {
      const adapter = file.adapterId === undefined ? undefined : adaptersById.get(file.adapterId);
      record(
        adapter === undefined
          ? await unclaimedOutcome(file)
          : await claimedOutcome(file, adapter, ready),
      );
    } finally {
      ready();
    }
  };

  // Bound the files in flight (and so the texts held in memory). The bound must exceed the worker threshold:
  // jobs waiting for the pool to start hold their slots.
  const limiter = new Limiter(Math.max(4 * WORKER_THRESHOLD, 2 * workers * BATCH_SIZE));
  const abort = (): void => {
    void scheduler.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  const tasks: Array<Promise<void>> = [];
  const submitted: Array<Promise<void>> = [];
  for (const file of sorted) {
    await limiter.acquire();
    if (signal?.aborted === true) {
      limiter.release();
      break;
    }
    const ready = deferred();
    submitted.push(ready.promise);
    tasks.push(
      processFile(file, ready.resolve).finally(() => {
        limiter.release();
      }),
    );
  }
  // Decide where pending parse jobs run only once every file has been read and submitted.
  await Promise.all(submitted);
  scheduler.endOfInput();
  const settled = await Promise.allSettled(tasks);
  signal?.removeEventListener("abort", abort);
  stats.workers = scheduler.workersStarted;
  await scheduler.close();
  signal?.throwIfAborted();
  const failure = settled.find((result) => result.status === "rejected");
  if (failure !== undefined) throw failure.reason;

  if (markedGenerated.length > 0) {
    markedGenerated.sort((a, b) => compareStrings(a.path, b.path));
    logger.info(
      "Not parsed: a header comment marks these files as generated code (assign another role in the " +
        "configuration to parse them)",
      {
        count: markedGenerated.length,
        files: markedGenerated
          .slice(0, MAX_LOGGED_PATHS)
          .map(({ path, line }) => `${path}:${line}`),
      },
    );
  }
  stats.files = outcomes.size;
  return {
    results: sorted.flatMap((file) => {
      const outcome = outcomes.get(file.path);
      return outcome === undefined ? [] : [outcome];
    }),
    diagnostics: sortDiagnostics(diagnostics),
    stats,
  };
}
