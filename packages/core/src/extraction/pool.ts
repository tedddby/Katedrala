/**
 * A pool of worker threads that parse files with adapters loaded from their worker modules.
 *
 * Results are delivered per file (each job has its own callback), so the order in which batches complete
 * never influences the output.
 */
import { Worker } from "node:worker_threads";
import type { Logger } from "@katedrala/plugin-api";
import { errorMessage } from "../util/diagnostics.js";
import type {
  BatchRequest,
  WorkerAdapterSpec,
  WorkerFile,
  WorkerFileResult,
  WorkerMessage,
  WorkerSetup,
} from "./protocol.js";

/** One file to parse in a worker, with the callback receiving its outcome. */
export interface PoolJob {
  readonly file: WorkerFile;
  /** Receives the outcome exactly once. */
  readonly settle: (result: WorkerFileResult) => void;
  /**
   * Set by the pool when a worker died while this job was in its batch with other jobs. The job then runs
   * alone, so that a crash can be attributed to it.
   */
  suspect: boolean;
}

/** Options of {@link WorkerPool}. */
export interface WorkerPoolOptions {
  /** Maximum number of workers (at least 1). */
  size: number;
  /** URL of the worker entry module. */
  workerUrl: URL;
  /** Adapters workers may load. */
  adapters: WorkerAdapterSpec[];
  /** Maximum files per batch. */
  batchSize: number;
  logger: Logger;
  /**
   * Receives jobs the pool will not run: every job when worker threads cannot be started at all, the jobs
   * of an adapter that cannot be loaded in workers, and the jobs left when workers keep stopping. The
   * receiver runs them in the main thread.
   */
  fallback: (jobs: PoolJob[]) => void;
}

interface PoolWorker {
  readonly worker: Worker;
  ready: boolean;
  batch: { id: number; jobs: PoolJob[] } | undefined;
}

/** A job whose worker died while it ran alone, waiting until a completed batch shows workers can parse. */
interface CrashedJob {
  readonly job: PoolJob;
  readonly error: string;
}

/**
 * Jobs that may crash their workers while running alone before any batch has completed: beyond this, the
 * workers are taken to be unable to parse anything here.
 */
const MAX_UNCONFIRMED_CRASHES = 8;

/**
 * Worker threads parsing batches of files. Workers are started on demand (never more than there is queued
 * work for, never more than `size`), take batches of up to `batchSize` files and stay alive until `close()`.
 *
 * Failure handling, designed so that which files fail depends on the files, not on the number of workers or
 * on how files were batched:
 * - When no worker ever starts (e.g. the entry module cannot be loaded), the pool is broken and every job
 *   goes to `fallback`.
 * - When an adapter cannot be loaded in a worker, its jobs (and later ones) go to `fallback`.
 * - When a worker dies with a batch of several jobs in flight, none of them is blamed: each is retried in a
 *   batch of its own. A job fails only when its worker dies while it runs alone, and it is not retried in
 *   the main thread, which it could crash too. Until some batch has completed in a worker, such a job waits:
 *   the crash may be the environment's rather than the file's.
 * - Dead workers are replaced, up to `2 × size` replacements plus two for each job that crashed a worker
 *   alone (a crashing file costs at most two deaths: its batch's and its own), so that crashing files never
 *   exhaust the replacements. When workers die for other reasons until no replacement is left, or every job
 *   tried so far crashed its worker, the pool gives up: every job not settled, waiting ones included, goes
 *   to `fallback`, as do later ones.
 */
export class WorkerPool {
  readonly #options: WorkerPoolOptions;
  readonly #queue: PoolJob[] = [];
  readonly #workers = new Set<PoolWorker>();
  readonly #unavailableAdapters = new Set<string>();
  /** Jobs that crashed a worker while running alone, before any batch completed. */
  readonly #crashed: CrashedJob[] = [];
  #started = 0;
  #readyWorkers = 0;
  #completedBatches = 0;
  /** Jobs failed because their worker died while they ran alone. */
  #failedJobs = 0;
  #cannotSpawn = false;
  #broken = false;
  #closed = false;
  #nextBatchId = 0;

  constructor(options: WorkerPoolOptions) {
    this.#options = { ...options, size: Math.max(1, Math.floor(options.size)) };
  }

  /** Number of workers that started successfully (became ready) so far. */
  get readyWorkers(): number {
    return this.#readyWorkers;
  }

  /** Queue a job. */
  submit(job: PoolJob): void {
    if (this.#closed) {
      job.settle({ ok: false, error: "The worker pool is closed" });
    } else if (this.#broken || this.#unavailableAdapters.has(job.file.adapterId)) {
      this.#options.fallback([job]);
    } else {
      this.#queue.push(job);
      this.#dispatch();
    }
  }

  /**
   * Terminate every worker. Jobs still queued, waiting or in flight are settled as failed with `reason`
   * (callers that close early, e.g. on abort, discard those outcomes).
   */
  async close(reason = "The worker pool was closed"): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const pending = [...this.#queue.splice(0), ...this.#crashed.splice(0).map(({ job }) => job)];
    for (const entry of this.#workers) pending.push(...(entry.batch?.jobs ?? []));
    const workers = [...this.#workers];
    this.#workers.clear();
    for (const job of pending) job.settle({ ok: false, error: reason });
    await Promise.all(workers.map((entry) => entry.worker.terminate().catch(() => 0)));
  }

  /** Workers that may be started in total (the first `size`, then replacements). */
  #maxStarts(): number {
    return 3 * this.#options.size + 2 * (this.#failedJobs + this.#crashed.length);
  }

  #dispatch(): void {
    if (this.#closed || this.#broken) return;
    // After too many crashes and no completed batch, start nothing more: what is in flight decides.
    const doubtful = this.#crashed.length >= MAX_UNCONFIRMED_CRASHES;
    if (!doubtful) {
      for (const entry of this.#workers) {
        if (this.#queue.length === 0) break;
        if (entry.ready && entry.batch === undefined) this.#send(entry);
      }
      // Start workers only for work that the starting workers will not already take.
      let starting = [...this.#workers].filter((entry) => !entry.ready).length;
      while (
        this.#queue.length > starting * this.#options.batchSize &&
        this.#workers.size < this.#options.size &&
        this.#started < this.#maxStarts() &&
        !this.#cannotSpawn
      ) {
        if (!this.#spawn()) break;
        starting++;
      }
    }
    const busy = [...this.#workers].some((entry) => entry.batch !== undefined);
    if (
      // No worker is left and none may be started.
      (this.#workers.size === 0 && this.#queue.length > 0) ||
      // Every job tried so far crashed its worker, and nothing in flight can show that workers can parse.
      (this.#crashed.length > 0 && !busy && (this.#queue.length === 0 || doubtful))
    ) {
      this.#giveUp();
    }
  }

  #send(entry: PoolWorker): void {
    const first = this.#queue[0];
    if (first === undefined) return;
    // A suspect runs alone, so that a crash can be attributed to it.
    let take = 1;
    if (!first.suspect) {
      while (take < this.#options.batchSize && this.#queue[take]?.suspect === false) take++;
    }
    const jobs = this.#queue.splice(0, take);
    const id = this.#nextBatchId++;
    entry.batch = { id, jobs };
    const request: BatchRequest = { type: "batch", id, files: jobs.map((job) => job.file) };
    try {
      entry.worker.postMessage(request);
    } catch (error) {
      entry.batch = undefined;
      for (const job of jobs) {
        job.settle({
          ok: false,
          error: `Cannot send the file to a worker: ${errorMessage(error)}`,
        });
      }
    }
  }

  #spawn(): boolean {
    const setup: WorkerSetup = { adapters: this.#options.adapters };
    let worker: Worker;
    try {
      worker = new Worker(this.#options.workerUrl, { workerData: setup });
    } catch (error) {
      this.#options.logger.warn("Cannot start an extraction worker", {
        error: errorMessage(error),
      });
      this.#cannotSpawn = true;
      return false;
    }
    this.#started++;
    const entry: PoolWorker = { worker, ready: false, batch: undefined };
    this.#workers.add(entry);
    worker.on("message", (message: WorkerMessage) => {
      this.#onMessage(entry, message);
    });
    worker.on("error", (error: unknown) => {
      this.#onDeath(entry, errorMessage(error));
    });
    worker.on("exit", (code: number) => {
      this.#onDeath(entry, `exited with code ${code}`);
    });
    worker.on("messageerror", (error: unknown) => {
      this.#onDeath(entry, `sent an unreadable message: ${errorMessage(error)}`);
    });
    return true;
  }

  #onMessage(entry: PoolWorker, message: WorkerMessage): void {
    if (this.#closed || !this.#workers.has(entry)) return;
    if (message.type === "ready") {
      entry.ready = true;
      this.#readyWorkers++;
      this.#dispatch();
      return;
    }
    const batch = entry.batch;
    if (batch?.id !== message.id) return;
    entry.batch = undefined;
    const unavailable: PoolJob[] = [];
    let parsed = false;
    for (const [index, job] of batch.jobs.entries()) {
      const missing: WorkerFileResult = { ok: false, error: "The worker returned no result" };
      const result = message.results[index] ?? missing;
      if (!result.ok && result.unavailable === true) {
        this.#unavailableAdapters.add(job.file.adapterId);
        unavailable.push(job);
      } else {
        parsed = true;
        job.settle(result);
      }
    }
    if (parsed) this.#onBatchCompleted();
    if (unavailable.length > 0) {
      this.#options.logger.warn(
        "An adapter cannot be loaded in worker threads; parsing in the main thread",
        {
          adapters: [...new Set(unavailable.map((job) => job.file.adapterId))],
        },
      );
      const keep: PoolJob[] = [];
      for (const job of this.#queue.splice(0)) {
        if (this.#unavailableAdapters.has(job.file.adapterId)) unavailable.push(job);
        else keep.push(job);
      }
      this.#queue.push(...keep);
      this.#options.fallback(unavailable);
    }
    this.#dispatch();
  }

  /** Workers can parse: the jobs that crashed a worker while running alone did so by themselves. */
  #onBatchCompleted(): void {
    this.#completedBatches++;
    for (const { job, error } of this.#crashed.splice(0)) this.#fail(job, error);
  }

  #fail(job: PoolJob, error: string): void {
    this.#failedJobs++;
    job.settle({ ok: false, error });
  }

  #onDeath(entry: PoolWorker, reason: string): void {
    if (this.#closed || !this.#workers.delete(entry)) return;
    void entry.worker.terminate().catch(() => 0);
    const jobs = entry.batch?.jobs ?? [];
    entry.batch = undefined;
    if (this.#broken) {
      // The pool gave up while nothing was in flight; never leave a job unsettled all the same.
      if (jobs.length > 0) this.#options.fallback(jobs);
      return;
    }
    if (!entry.ready && this.#readyWorkers === 0) {
      // Worker threads cannot be started here: parse everything in the main thread.
      this.#options.logger.warn(
        "Extraction workers cannot be started; parsing in the main thread",
        {
          reason,
        },
      );
      this.#broken = true;
      const remaining = [
        ...jobs,
        ...this.#crashed.splice(0).map(({ job }) => job),
        ...this.#queue.splice(0),
      ];
      if (remaining.length > 0) this.#options.fallback(remaining);
      return;
    }
    this.#options.logger.warn("An extraction worker stopped unexpectedly", { reason });
    const [alone] = jobs;
    if (jobs.length === 1 && alone !== undefined) {
      const error = `The worker parsing this file stopped unexpectedly (${reason})`;
      if (this.#completedBatches > 0) this.#fail(alone, error);
      else this.#crashed.push({ job: alone, error });
    } else {
      for (const job of jobs) job.suspect = true;
      this.#queue.unshift(...jobs);
    }
    this.#dispatch();
  }

  /** Workers cannot be relied on any more: run every job not settled (and later ones) in the main thread. */
  #giveUp(): void {
    this.#broken = true;
    const jobs = [...this.#crashed.splice(0).map(({ job }) => job), ...this.#queue.splice(0)];
    if (jobs.length === 0) return;
    this.#options.logger.warn(
      "Extraction workers keep stopping; parsing the remaining files in the main thread",
      { files: jobs.length },
    );
    this.#options.fallback(jobs);
  }
}
