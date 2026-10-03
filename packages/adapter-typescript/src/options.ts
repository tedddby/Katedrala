/**
 * Options of the TypeScript/JavaScript adapter. Options are part of the extraction cache key, so every option
 * that changes extraction output must be listed here (and nothing else).
 */

/** Options of the TypeScript/JavaScript adapter, as written in configuration (every option is optional). */
export interface TypeScriptAdapterOptions {
  /**
   * Record calls on local variables and parameters whose type is unknown when they look like registrations
   * (a string, template, function, object or binding argument), e.g. `app.get("/users", handler)` inside a
   * factory function. Needed by framework detectors. Default `true`.
   */
  recordUntypedCalls?: boolean;
}

/** Adapter options with every default applied. */
export type ResolvedTypeScriptAdapterOptions = Required<TypeScriptAdapterOptions>;

/** The default value of every adapter option. */
export const DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS: ResolvedTypeScriptAdapterOptions = Object.freeze({
  recordUntypedCalls: true,
});

/** Error thrown for invalid adapter options (e.g. from configuration). */
export class TypeScriptAdapterOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeScriptAdapterOptionsError";
  }
}

/** Validate and complete options coming from configuration or from a worker message. */
export function resolveTypeScriptAdapterOptions(
  options: unknown,
): ResolvedTypeScriptAdapterOptions {
  if (options === undefined || options === null) return { ...DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS };
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new TypeScriptAdapterOptionsError("TypeScript adapter options must be an object");
  }
  const record = options as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS, key)) {
      throw new TypeScriptAdapterOptionsError(`Unknown TypeScript adapter option: ${key}`);
    }
  }
  const recordUntypedCalls =
    record.recordUntypedCalls ?? DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS.recordUntypedCalls;
  if (typeof recordUntypedCalls !== "boolean") {
    throw new TypeScriptAdapterOptionsError("recordUntypedCalls must be a boolean");
  }
  return { recordUntypedCalls };
}
