/**
 * Assembly of `InferenceInfo` (§5.1, plan 4.6; docs/ALGORITHMS.md, "Evidence and explanation"): the
 * confidence of an inferred module or layer as the weighted sum of its signals, the total order of its
 * evidence, rounding, bounded entity lists, and the number formats descriptions use.
 *
 * Determinism: every published number is rounded with `roundMetric` (D-57: nine significant digits, as IR.md
 * specifies, not ADR-007's "six decimals"); descriptions format numbers with `toFixed`, which ECMAScript
 * specifies exactly, from the rounded value (D-58), never with locale-dependent formatting. The evidence order
 * is total, so equal inputs give byte-identical output whatever order the signals were listed in.
 */
import { compareStrings, roundMetric, sortedUnique } from "@katedrala/ir";
import type { EntityId, Evidence, InferenceInfo } from "@katedrala/ir";
import type { ContextSignal, InferenceInfoInput, WeightedSignal } from "./types.js";

/** The prefix every reason of an inferred conclusion starts with (D-66). */
const REASON_PREFIX = "Inferred:";

/** `-0`, `-0.0`, ...: `toFixed` of a value that rounds to zero from below. */
const NEGATIVE_ZERO = /^-0(?:\.0+)?$/;

/** The sorted, de-duplicated entities of a signal, at most `maxEntities`; undefined when none remain. */
function boundedEntities(
  entities: readonly EntityId[] | undefined,
  maxEntities: number,
): EntityId[] | undefined {
  if (entities === undefined) return undefined;
  // IR: "sorted, and bounded by limits.maxEvidenceEntities (selection: sort by id, then truncate)".
  const bounded = sortedUnique(entities).slice(0, maxEntities);
  return bounded.length === 0 ? undefined : bounded;
}

/**
 * One evidence entry with rounded numbers and bounded entities. Keys are created in the order of the IR's
 * `Evidence` interface, so serialization is canonical without re-sorting keys.
 */
function toEvidence(
  signal: ContextSignal | WeightedSignal,
  maxEntities: number,
  weight: number | undefined,
): Evidence {
  const evidence: Evidence = { signal: signal.signal, description: signal.description };
  if (signal.value !== undefined) evidence.value = roundMetric(signal.value);
  if (weight !== undefined) evidence.weight = roundMetric(weight);
  const entities = boundedEntities(signal.entities, maxEntities);
  if (entities !== undefined) evidence.entities = entities;
  return evidence;
}

/** Element-wise `compareStrings`; a list that is a prefix of the other comes first. */
function compareEntityLists(a: readonly string[], b: readonly string[]): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const order = compareStrings(a[index] ?? "", b[index] ?? "");
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

/** Absent values first, then ascending. */
function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined)
    return (a === undefined ? 0 : 1) - (b === undefined ? 0 : 1);
  return a - b;
}

/** The order of unweighted evidence: signal, description, value (absent first), entities element-wise. */
function compareContext(a: Evidence, b: Evidence): number {
  return (
    compareStrings(a.signal, b.signal) ||
    compareStrings(a.description, b.description) ||
    compareOptionalNumbers(a.value, b.value) ||
    compareEntityLists(a.entities ?? [], b.entities ?? [])
  );
}

/** `weight × value` of a published entry (an absent value counts 0). */
function contribution(evidence: Evidence): number {
  return (evidence.weight ?? 0) * (evidence.value ?? 0);
}

/**
 * The order of weighted evidence: decreasing `weight × value`, then signal; the remaining keys (those of
 * context evidence, then the weight) only make the order total for malformed inputs with repeated signals.
 * Computed on the published (rounded) fields, so a reader can verify the order from the document.
 */
function compareWeighted(a: Evidence, b: Evidence): number {
  return (
    contribution(b) - contribution(a) ||
    compareStrings(a.signal, b.signal) ||
    compareContext(a, b) ||
    (a.weight ?? 0) - (b.weight ?? 0)
  );
}

/**
 * Assemble the `InferenceInfo` of an inferred conclusion [KATEDRALA HEURISTIC] (§5.1, plan 4.6):
 *
 * - `confidence = Σ weight × (value ?? 0)` over the weighted signals, computed from the unrounded values
 *   (D-45: a signal without a value could not be computed and contributes 0, but is still listed with its
 *   weight) and then rounded with `roundMetric`; recomputing it from the rounded entries agrees within 1e-8
 *   (D-57). The weights are not checked to sum to 1: each kind's tests assert it;
 * - every `value` and `weight` is rounded with `roundMetric`;
 * - the evidence is totally ordered (review #34): weighted signals by decreasing `weight × value` (absent
 *   value = 0), then by `signal`; then the context signals by `signal`, then `description`, then `value`
 *   (absent first), then `entities` compared element-wise. Both orders are computed on the rounded fields;
 * - each `entities` list is sorted, de-duplicated and truncated to `maxEntities`
 *   (`limits.maxEvidenceEntities`); an empty list is omitted;
 * - weighted entries carry `weight`, context entries never do.
 *
 * The sum runs over the weighted signals in their published order, so the confidence does not depend on the
 * order in which the producer listed them (IR.md: reductions in canonical order).
 *
 * Complexity: O(s log s + Σ e log e) for s signals with e entities each. Determinism: total orders,
 * `roundMetric`, no locale.
 *
 * @throws {RangeError} when `reason` does not begin with "Inferred:" (D-66: inferred conclusions say so),
 *   when `maxEntities` is not a non-negative integer, or when a number is not finite.
 */
export function inferenceInfo(input: InferenceInfoInput): InferenceInfo {
  const { method, reason, weighted, context, maxEntities } = input;
  // D-66: every reason of an inferred conclusion is worded as an inference.
  if (!reason.startsWith(REASON_PREFIX)) {
    throw new RangeError(
      `An inferred conclusion's reason must begin with "${REASON_PREFIX}": ${reason}`,
    );
  }
  if (!Number.isInteger(maxEntities) || maxEntities < 0) {
    throw new RangeError(`maxEntities must be a non-negative integer, got ${maxEntities}`);
  }
  const entries = weighted.map((signal) => ({
    evidence: toEvidence(signal, maxEntities, signal.weight),
    // D-45: an absent value contributes 0.
    term: signal.weight * (signal.value ?? 0),
  }));
  entries.sort((a, b) => compareWeighted(a.evidence, b.evidence));
  let confidence = 0;
  for (const entry of entries) confidence += entry.term;
  const contextual = context
    .map((signal) => toEvidence(signal, maxEntities, undefined))
    .sort(compareContext);
  return {
    confidence: roundMetric(confidence),
    method,
    reason,
    evidence: [...entries.map((entry) => entry.evidence), ...contextual],
  };
}

/** `toFixed` of the published value of `value`, with no minus sign on a result that reads as zero. */
function fixed(value: number, digits: number): string {
  // D-58: descriptions format the published (rounded) value with `toFixed`, never with locale formatting.
  const text = roundMetric(value).toFixed(digits);
  return NEGATIVE_ZERO.test(text) ? text.slice(1) : text;
}

/**
 * A share as an integer percentage for descriptions [DERIVED] (D-58): `0.75` → `"75%"`, `0.857142` →
 * `"86%"`. The share is rounded with `roundMetric` first, as published, and the percentage again before
 * `toFixed(0)`, so the text agrees with the decimal value in the evidence (`0.285` → `"29%"`, as
 * `toFixed` rounds an exact half up).
 *
 * Complexity: O(1). Determinism: `toFixed` is exactly specified; no locale.
 *
 * @throws {RangeError} when `x` is not finite.
 */
export function formatPercent(x: number): string {
  return `${fixed(roundMetric(x) * 100, 0)}%`;
}

/**
 * A number for descriptions with a fixed number of decimals [DERIVED] (D-58): weights with one decimal
 * (`formatNumber(3, 1)` → `"3.0"`), values with two or three (`formatNumber(0.7142857, 2)` → `"0.71"`).
 * The value is rounded with `roundMetric` first, so the text agrees with the published field; a result that
 * reads as zero has no minus sign.
 *
 * Complexity: O(digits). Determinism: `toFixed` is exactly specified; no locale.
 *
 * @throws {RangeError} when `x` is not finite or `digits` is outside 0–100 (`toFixed`).
 */
export function formatNumber(x: number, digits: number): string {
  return fixed(x, digits);
}

/**
 * Items joined as an English list for descriptions [DERIVED]: `[]` → `""`, `["a"]` → `"a"`,
 * `["a", "b"]` → `"a and b"`, `["order", "payment", "user"]` → `"order, payment and user"` (plan 4.6's
 * `organization-style` template). Items keep the given order: callers sort them (by `compareStrings`) and
 * bound them (`limits.maxEvidenceEntities`) first.
 *
 * Complexity: O(total length). Determinism: no locale (`Intl.ListFormat` would depend on it).
 */
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}
