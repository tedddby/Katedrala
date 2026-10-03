/**
 * Messages exchanged between the extraction worker pool and its workers (`worker-entry.ts`). Types only:
 * the worker entry must stay free of runtime imports besides Node built-ins.
 */
import type { FileExtraction } from "@katedrala/plugin-api";

/** An adapter a worker can load: its worker module exports `createAdapter(options)`. */
export interface WorkerAdapterSpec {
  id: string;
  /** Absolute `file:` URL of the adapter's worker module. */
  module: string;
  /** Options passed to `createAdapter` (structured-cloneable). */
  options: unknown;
}

/** `workerData` of every worker. */
export interface WorkerSetup {
  adapters: WorkerAdapterSpec[];
}

/** One file to parse. */
export interface WorkerFile {
  adapterId: string;
  path: string;
  text: string;
  language: string;
  dialect?: string;
}

/** Main thread → worker: parse a batch of files. */
export interface BatchRequest {
  type: "batch";
  id: number;
  files: WorkerFile[];
}

/** The outcome of one file of a batch. */
export type WorkerFileResult =
  | { ok: true; extraction: FileExtraction }
  | {
      ok: false;
      error: string;
      /** The adapter could not be created or initialized in the worker (not a problem of this file). */
      unavailable?: boolean;
    };

/** Worker → main thread. */
export type WorkerMessage =
  | { type: "ready" }
  | {
      type: "result";
      id: number;
      /** One result per file of the batch, in batch order. */
      results: WorkerFileResult[];
    };
