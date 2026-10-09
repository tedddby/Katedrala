/**
 * The metrics projection: the file-level dependency graph that aggregated dependencies (milestone 5) and
 * metrics (milestone 6) are computed on, so that both describe the same graph.
 */
import type { EffectiveCoreSettings } from "@katedrala/core";
import { compareStrings, type FileRole } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS, DEFAULT_FILE_ROLES, type ProjectionOptions } from "@katedrala/model";

/**
 * The projection options of the metrics projection [DERIVED] (milestone 5 plan 3.4):
 *
 * - `edgeKinds`: `DEFAULT_EDGE_KINDS` (every relationship kind except `depends-on-package`);
 * - `includeTypeOnly`: `analysis.include_type_only`;
 * - `fileRoles`: `DEFAULT_FILE_ROLES` (`declaration`, `source`), plus `test` with
 *   `analysis.include_tests_in_metrics`.
 *
 * Inference computes the aggregated `dependencies` and `dependents` of components, modules and layers on it,
 * and module inference reads it for `publicApi` (D-63) and the attachment policy (D-65); milestone 6 writes
 * `toProjectionInfo` of the same value to `metrics.projection`, so both stages agree by construction. Layer
 * *ordering* does not use it: it always counts type-only references at `type_only_weight` (D-02, D-51).
 * `includeExternals` is left unset, as `ProjectionInfo` does not describe it (`fromProjectionInfo` of the
 * result's `toProjectionInfo` gives back equal options).
 *
 * Complexity: O(1) (the edge-kind and role lists are constant). Determinism: fresh sets, iterating in sorted
 * order. References: plan 3.4, 5.1; docs/IR.md, "Architecture" (aggregated dependencies) and "Metrics and
 * findings" (`metrics.projection`).
 */
export function metricsProjectionOptions(
  settings: Pick<EffectiveCoreSettings, "includeTypeOnly" | "includeTestsInMetrics">,
): ProjectionOptions {
  const fileRoles: FileRole[] = [...DEFAULT_FILE_ROLES];
  if (settings.includeTestsInMetrics) fileRoles.push("test");
  return {
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    includeTypeOnly: settings.includeTypeOnly,
    fileRoles: new Set(fileRoles.sort(compareStrings)),
  };
}
