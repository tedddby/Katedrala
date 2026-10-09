/**
 * Canonical JSON: the serialization used wherever a value feeds a digest (configuration, adapter options,
 * the parameter hashes of inference method strings).
 *
 * It lives in `@katedrala/ir` so that every package hashes with the same function, including packages that
 * must not depend on `@katedrala/core` (inference). `@katedrala/core` re-exports it unchanged, so its API and
 * every digest it computes are byte-identical to before the move.
 */
import { compareStrings } from "./ids.js";

/**
 * Serialize a JSON-compatible value canonically [DERIVED: a pure function of the value]: object keys are
 * sorted with `compareStrings` (UTF-16 code unit order, independent of insertion order and of JavaScript's
 * integer-like key ordering) and there is no insignificant whitespace. Values JSON cannot represent follow `JSON.stringify`: non-finite numbers become
 * `null`, properties whose value is `undefined`, a function or a symbol are omitted, such array elements
 * become `null`, and `toJSON` methods are honoured. Shared (non-cyclic) references are serialized at every
 * occurrence.
 *
 * Complexity: O(size of the value + Σ k log k over objects with k keys). Determinism: the output depends only
 * on the value, never on property insertion order, locale or platform.
 *
 * @example canonicalJson({ b: 1, a: [true, null] }) === '{"a":[true,null],"b":1}'
 * @throws {TypeError} for cyclic structures and `bigint` values.
 */
export function canonicalJson(value: unknown): string {
  return write(value, new Set()) ?? "null";
}

function write(value: unknown, ancestors: Set<object>): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") throw new TypeError("Cannot serialize a bigint as JSON");
  if (typeof value !== "object") return undefined;

  if (ancestors.has(value)) throw new TypeError("Cannot serialize a cyclic structure as JSON");
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") {
    return write((toJSON as (this: unknown) => unknown).call(value), ancestors);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value as readonly unknown[];
      return `[${items.map((item) => write(item, ancestors) ?? "null").join(",")}]`;
    }
    const record = value as Readonly<Record<string, unknown>>;
    const members: string[] = [];
    for (const key of Object.keys(record).sort(compareStrings)) {
      const text = write(record[key], ancestors);
      if (text !== undefined) members.push(`${JSON.stringify(key)}:${text}`);
    }
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
