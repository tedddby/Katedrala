/**
 * Scheduling parse jobs: in the main thread, or in a worker pool when there is enough work.
 */
import type { FileExtraction, LanguageAdapter, Logger, ParseInput } from "@katedrala/plugin-api";
import { isFileExtraction } from "../cache/cache.js";
import { errorMessage } from "../util/diagnostics.js";
import { initializeAdapter } from "./adapters.js";
import { WorkerPool, type PoolJob } from "./pool.js";
import type { WorkerAdapterSpec, WorkerFileResult } from "./protocol.js";

/** Files per batch, in workers and for `extractBatch`. */
export const BATCH_SIZE = 32;

/** Minimum number of pending parse jobs before worker threads are started. */
export const WORKER_THRESHOLD = 64;

/** The outcome of one parse job. */
export type JobResult =
  | { ok: true; extraction: FileExtraction }
  | {
      ok: false;
      /** Why the file could not be parsed. */
      error: string;
      /** The adapter could not be initialized (not a problem of this file). */
      initialization?: boolean;
    };

/** Options of {@link ParseScheduler}. */
export interface ParseSchedulerOptions {
  /** Every adapter jobs may be submitted for (those with a `workerModule` may run in workers). */
  adapters: readonly LanguageAdapter[];
  /** Worker threads to use at most; worker threads are used only when greater than 1. */
  workers: number;
  workerUrl: URL;
  logger: Logger;
  signal?: AbortSignal | undefined;
}

async function extractOne(adapter: LanguageAdapter, input: ParseInput): Promise<JobResult> {
  try {
    const parsed: unknown = await adapter.parse(input);
    const extraction: unknown = await adapter.extract(parsed, input);
    if (!isFileExtraction(extraction)) {
      return { ok: false, error: `Adapter "${adapter.id}" returned an invalid extraction` };
    }
    return { ok: true, extraction };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

interface QueuedJob {
  input: ParseInput;
  settle: (result: JobResult) => void;
}

/**
 * Runs the jobs of one adapter in the main thread, one batch at a time (adapters are never called
 * concurrently). Uses `extractBatch` when the adapter has it, falling back to one file at a time when a batch
 * fails, so that a failure is attributed to the right file.
 */
class AdapterQueue {
  readonly #adapter: LanguageAdapter;
  readonly #signal: AbortSignal | undefined;
  readonly #jobs: QueuedJob[] = [];
  #running = false;

  constructor(adapter: LanguageAdapter, signal: AbortSignal | undefined) {
    this.#adapter = adapter;
    this.#signal = signal;
  }

  push(job: QueuedJob): void {
    this.#jobs.push(job);
    if (!this.#running) {
      this.#running = true;
      void this.#drain();
    }
  }

  async #drain(): Promise<void> {
    try {
      let initializationError: string | undefined;
      try {
        await initializeAdapter(this.#adapter);
      } catch (error) {
        initializationError = errorMessage(error);
      }
      while (this.#jobs.length > 0) {
        const batch = this.#jobs.splice(0, BATCH_SIZE);
        if (this.#signal?.aborted === true) {
          for (const job of batch) job.settle({ ok: false, error: "Extraction was aborted" });
        } else if (initializationError !== undefined) {
          const error = `Adapter "${this.#adapter.id}" could not be initialized: ${initializationError}`;
          for (const job of batch) job.settle({ ok: false, error, initialization: true });
        } else {
          await this.#run(batch);
        }
      }
    } finally {
      this.#running = false;
    }
  }

  async #run(batch: readonly QueuedJob[]): Promise<void> {
    if (this.#adapter.extractBatch !== undefined && batch.length > 1) {
      try {
        const extractions: unknown[] = await this.#adapter.extractBatch(
          batch.map((job) => job.input),
        );
        if (extractions.length === batch.length && extractions.every(isFileExtraction)) {
          batch.forEach((job, index) => {
            const extraction = extractions[index];
            if (isFileExtraction(extraction)) job.settle({ ok: true, extraction });
          });
          return;
        }
      } catch {
        // Fall back to one file at a time below.
      }
    }
    for (const job of batch) {
      if (this.#signal?.aborted === true)
        job.settle({ ok: false, error: "Extraction was aborted" });
      else job.settle(await extractOne(this.#adapter, job.input));
    }
  }
}

/**
 * Decides where each parse job runs. Jobs of adapters with a `workerModule` wait until
 * {@link WORKER_THRESHOLD} of them are pending, then a {@link WorkerPool} is started for them (when more than
 * one worker is allowed); if fewer arrive before {@link ParseScheduler.endOfInput}, they run in the main
 * thread. Every other job runs in the main thread right away.
 */
export class ParseScheduler {
  readonly #options: ParseSchedulerOptions;
  readonly #queues = new Map<LanguageAdapter, AdapterQueue>();
  readonly #adaptersById = new Map<string, LanguageAdapter>();
  /** How to settle a pool job with a main-thread result (keeping every detail of the result). */
  readonly #resolvers = new WeakMap<PoolJob, (result: JobResult) => void>();
  #pending: Array<{ adapter: LanguageAdapter; job: PoolJob }> = [];
  #pool: WorkerPool | undefined;
  #inputEnded = false;

  constructor(options: ParseSchedulerOptions) {
    this.#options = options;
    for (const adapter of options.adapters) this.#adaptersById.set(adapter.id, adapter);
  }

  /** Number of worker threads that started successfully. */
  get workersStarted(): number {
    return this.#pool?.readyWorkers ?? 0;
  }

  /** Parse one file with an adapter; never rejects (failures are results). */
  submit(adapter: LanguageAdapter, input: ParseInput): Promise<JobResult> {
    return new Promise((resolve) => {
      if (
        this.#options.workers <= 1 ||
        adapter.workerModule === undefined ||
        this.#adaptersById.get(adapter.id) !== adapter
      ) {
        this.#runInMainThread(adapter, input, resolve);
        return;
      }
      const job: PoolJob = {
        file: {
          adapterId: adapter.id,
          path: input.path,
          text: input.text,
          language: input.language,
          ...(input.dialect === undefined ? {} : { dialect: input.dialect }),
        },
        settle: (result: WorkerFileResult) => {
          resolve(result.ok ? result : { ok: false, error: result.error });
        },
        suspect: false,
      };
      this.#resolvers.set(job, resolve);
      if (this.#pool !== undefined) {
        this.#pool.submit(job);
      } else if (this.#inputEnded) {
        this.#runInMainThread(adapter, input, resolve);
      } else {
        this.#pending.push({ adapter, job });
        if (this.#pending.length >= WORKER_THRESHOLD) this.#startPool();
      }
    });
  }

  /** No more jobs will be submitted: pending jobs that did not reach the worker threshold run in the main thread. */
  endOfInput(): void {
    this.#inputEnded = true;
    if (this.#pool !== undefined) return;
    const pending = this.#pending;
    this.#pending = [];
    for (const { adapter, job } of pending) this.#fallback(adapter, job);
  }

  /** Stop the worker threads. Jobs still in flight are settled as failed. */
  async close(): Promise<void> {
    await this.#pool?.close(
      this.#options.signal?.aborted === true ? "Extraction was aborted" : undefined,
    );
  }

  #runInMainThread(
    adapter: LanguageAdapter,
    input: ParseInput,
    settle: (result: JobResult) => void,
  ): void {
    let queue = this.#queues.get(adapter);
    if (queue === undefined) {
      queue = new AdapterQueue(adapter, this.#options.signal);
      this.#queues.set(adapter, queue);
    }
    queue.push({ input, settle });
  }

  #fallback(adapter: LanguageAdapter, job: PoolJob): void {
    const input: ParseInput = {
      path: job.file.path,
      text: job.file.text,
      language: job.file.language,
      ...(job.file.dialect === undefined ? {} : { dialect: job.file.dialect }),
    };
    const resolve =
      this.#resolvers.get(job) ??
      ((result: JobResult): void => {
        job.settle(result.ok ? result : { ok: false, error: result.error });
      });
    this.#runInMainThread(adapter, input, resolve);
  }

  #startPool(): void {
    const specs: WorkerAdapterSpec[] = [];
    for (const adapter of this.#adaptersById.values()) {
      if (adapter.workerModule === undefined) continue;
      specs.push({ id: adapter.id, module: adapter.workerModule, options: adapter.options });
    }
    this.#pool = new WorkerPool({
      size: this.#options.workers,
      workerUrl: this.#options.workerUrl,
      adapters: specs,
      batchSize: BATCH_SIZE,
      logger: this.#options.logger,
      fallback: (jobs) => {
        for (const job of jobs) {
          const adapter = this.#adaptersById.get(job.file.adapterId);
          if (adapter === undefined) job.settle({ ok: false, error: "Unknown adapter" });
          else this.#fallback(adapter, job);
        }
      },
    });
    const pending = this.#pending;
    this.#pending = [];
    for (const { job } of pending) this.#pool.submit(job);
  }
}
