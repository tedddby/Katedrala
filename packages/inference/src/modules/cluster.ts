/**
 * Module clustering of one scope: phases P1–P6 of prior-anchored refinement (§3.3–§3.10; docs/ALGORITHMS.md,
 * "Modules"). The module stage (P0, P7–P9, `modules.ts`) calls {@link clusterScope} once per scope.
 *
 * Unconstrained clustering of dependency graphs scrambles intentional structure and is unstable (§3.2), so
 * modules start from the developers' own structure (directories, recurring file-name stems) and are refined
 * on dependency evidence only where the evidence is unambiguous. Every heuristic class and move is recorded
 * so that the module stage can explain it (D-66).
 *
 * Determinism: every phase is a pure function of the scope's graph and node paths, the settings, the labels
 * and the entry points; nodes are visited in ascending order (file id order), directories and keys in
 * `compareStrings` order, and every weight comparison is exact (D-67).
 */
import type { ClusteringContext, Scope, ScopeClustering } from "../types.js";
import { structuralClasses } from "./classes.js";
import { identifyUnits } from "./identity.js";
import { priorUnits } from "./prior.js";
import { reassign } from "./reassign.js";
import { splitOversized } from "./split.js";
import { applyStemUnits } from "./stems.js";

/**
 * Cluster the inference nodes of one scope into module units [KATEDRALA HEURISTIC] (§3.3):
 *
 * - **P1** ({@link priorUnits}): directory units below the source root; the root, containers and oversized
 *   directories with sub-directories are split (§3.5, D-25).
 * - **P2** ({@link applyStemUnits}): the organization style of every split directory, and stem units where
 *   file-name or sub-directory stems recur across layer directories and are connected (§3.6, D-26–D-28,
 *   D-70).
 * - **P3** ({@link structuralClasses}): utilities, orchestrators (composition roots) and facades on that
 *   prior, with what triggered each (§3.7, D-29–D-31, D-66).
 * - **P4** ({@link splitOversized}): Louvain pieces of oversized flat units, small pieces merged, keys
 *   deduplicated (§3.8, D-32–D-34, D-68).
 * - **P5** ({@link reassign}): strict-majority reassignment of unpinned files (§3.9, D-35–D-37, D-74).
 * - **P6** ({@link identifyUnits}): empty units dropped, keys and names from the prior (§3.10, D-38, D-39).
 *
 * The result lists the surviving units sorted by key (unique keys, without `~inferred`, which the module
 * stage appends on a collision with a declared name), the unit of every node, the P3 classes, the P2 group
 * organizations sorted by directory, the P5 relocations by node, and P5's pass count and convergence
 * (`converged` is false when P5 stopped at `maxPasses` with moves pending: the module stage reports
 * `limit-reached`, D-37). A scope without nodes gives no units (P0 never produces one).
 *
 * Complexity: O(n · D + (passes + 1) · (n + m) + Σ name lengths) for n nodes, m arcs and directory depth D,
 * plus O(m_U log m_U) per Louvain pass of every oversized unit (§7). Memory O(n + m).
 * Determinism: see the module comment; the result does not depend on the order of any input collection.
 *
 * @param scope - one scope of P0: its directory, package name and weighted graph (no arc leaves the scope,
 *   D-03); node `i` is the scope's i-th file in id order.
 * @param context - settings, the per-file layer labels of the roles stage (stem names, D-39), the files of
 *   the document's entry points (D-31) and the repository name (root names, D-38).
 */
export function clusterScope(scope: Scope, context: ClusteringContext): ScopeClustering {
  const { settings } = context;
  const prior = priorUnits(scope, settings);
  const stems = applyStemUnits(scope, prior, settings);
  const classified = structuralClasses(scope, prior.partition, settings, context.entryPoints);
  splitOversized(scope, prior, classified, settings, stems);
  const reassignment = reassign(scope, prior.partition, classified, settings);
  const { units, unitOf } = identifyUnits(scope, prior, stems, reassignment, context);
  return {
    scope,
    sourceRoot: prior.sourceRoot,
    units,
    unitOf,
    classes: classified.classes,
    groups: stems.groups.map((group) => group.organization),
    relocations: reassignment.relocations,
    passes: reassignment.passes,
    converged: reassignment.converged,
  };
}
