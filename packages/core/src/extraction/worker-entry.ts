/**
 * Worker-thread entry of the extraction pool.
 *
 * Each worker loads adapters lazily: for an adapter id it imports the adapter's worker module (an absolute
 * `file:` URL), calls its `createAdapter(options)` export (which may be async) and `init()`. It then parses
 * batches of files and answers with one result per file, in batch order.
 *
 * This module must only import Node built-ins at runtime (every other import is type-only) and must use only
 * erasable TypeScript syntax, so that it runs both from `dist` and, where Node strips types, from source.
 */
import { parentPort, workerData } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import type {
  FileExtraction,
  LanguageAdapter,
  LanguageAdapterFactory,
  ParseInput,
} from "@katedrala/plugin-api";
import type {
  BatchRequest,
  WorkerFile,
  WorkerFileResult,
  WorkerMessage,
  WorkerSetup,
} from "./protocol.js";

function requirePort(): MessagePort {
  if (parentPort === null) throw new Error("worker-entry must run in a worker thread");
  return parentPort;
}

const port = requirePort();
const setup = workerData as WorkerSetup;
const adapters = new Map<string, Promise<LanguageAdapter>>();

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "unknown error";
}

function isExtraction(value: unknown): value is FileExtraction {
  if (typeof value !== "object" || value === null) return false;
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

function loadAdapter(id: string): Promise<LanguageAdapter> {
  let adapter = adapters.get(id);
  if (adapter === undefined) {
    adapter = (async (): Promise<LanguageAdapter> => {
      const spec = setup.adapters.find((candidate) => candidate.id === id);
      if (spec === undefined) throw new Error(`No worker module is configured for adapter "${id}"`);
      const module = (await import(spec.module)) as { createAdapter?: unknown };
      if (typeof module.createAdapter !== "function") {
        throw new Error(`${spec.module} does not export a createAdapter function`);
      }
      const created = await (module.createAdapter as LanguageAdapterFactory)(spec.options);
      await created.init?.();
      return created;
    })();
    adapters.set(id, adapter);
  }
  return adapter;
}

function toInput(file: WorkerFile): ParseInput {
  const input: ParseInput = { path: file.path, text: file.text, language: file.language };
  if (file.dialect !== undefined) input.dialect = file.dialect;
  return input;
}

async function extractOne(adapter: LanguageAdapter, input: ParseInput): Promise<WorkerFileResult> {
  try {
    const parsed: unknown = await adapter.parse(input);
    const extraction: unknown = await adapter.extract(parsed, input);
    if (!isExtraction(extraction)) {
      return { ok: false, error: `Adapter "${adapter.id}" returned an invalid extraction` };
    }
    return { ok: true, extraction };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

async function extractGroup(
  adapter: LanguageAdapter,
  inputs: readonly ParseInput[],
): Promise<WorkerFileResult[]> {
  if (adapter.extractBatch !== undefined) {
    try {
      const extractions: unknown[] = await adapter.extractBatch(inputs);
      if (extractions.length === inputs.length && extractions.every(isExtraction)) {
        return extractions.map((extraction) => ({ ok: true, extraction }));
      }
    } catch {
      // Fall back to one file at a time, which isolates the failing file.
    }
  }
  const results: WorkerFileResult[] = [];
  for (const input of inputs) results.push(await extractOne(adapter, input));
  return results;
}

async function processBatch(request: BatchRequest): Promise<WorkerFileResult[]> {
  const results = request.files.map((): WorkerFileResult => ({
    ok: false,
    error: "The file was not processed",
  }));
  const groups = new Map<string, number[]>();
  request.files.forEach((file, index) => {
    const group = groups.get(file.adapterId);
    if (group === undefined) groups.set(file.adapterId, [index]);
    else group.push(index);
  });
  for (const [adapterId, indices] of groups) {
    let adapter: LanguageAdapter;
    try {
      adapter = await loadAdapter(adapterId);
    } catch (error) {
      const message = `Adapter "${adapterId}" is unavailable in worker threads: ${describe(error)}`;
      for (const index of indices)
        results[index] = { ok: false, error: message, unavailable: true };
      continue;
    }
    const inputs = indices.flatMap((index) => {
      const file = request.files[index];
      return file === undefined ? [] : [toInput(file)];
    });
    const groupResults = await extractGroup(adapter, inputs);
    indices.forEach((index, position) => {
      const result = groupResults[position];
      if (result !== undefined) results[index] = result;
    });
  }
  return results;
}

function transferable(result: WorkerFileResult): WorkerFileResult {
  try {
    structuredClone(result);
    return result;
  } catch {
    return { ok: false, error: "The extraction cannot be transferred from the worker thread" };
  }
}

function post(message: WorkerMessage): void {
  port.postMessage(message);
}

port.on("message", (request: BatchRequest) => {
  void processBatch(request).then((results) => {
    try {
      post({ type: "result", id: request.id, results });
    } catch {
      post({ type: "result", id: request.id, results: results.map(transferable) });
    }
  });
});

post({ type: "ready" });
