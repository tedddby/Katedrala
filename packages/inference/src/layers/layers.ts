/**
 * The layer stage (§4.3–§4.5; plan 4.5; docs/ALGORITHMS.md, "Layers"): declared layers [DERIVED], or layers
 * inferred from the per-file labels of the roles stage and ranked by the observed layer dependency graph
 * [KATEDRALA HEURISTIC]. The steps live in `partition.ts` (membership and pruning, declared layers),
 * `order.ts` (layer graph, cycles, conventional arcs, ranks) and `explain.ts` (confidence, evidence,
 * reasons); this module chains them.
 *
 * Determinism: every step is a pure function of the model, the settings and the labels; layers come out in
 * the IR's canonical order (rank, then id).
 */
import { compareStrings, layerId } from "@katedrala/ir";
import { DEFAULT_EDGE_KINDS } from "@katedrala/model";
import type { LayerDraft, LayersInput, LayersResult } from "../types.js";
import { explainLayers } from "./explain.js";
import { buildLayerGraph, orderLayers } from "./order.js";
import { declaredLayers, partitionLayers } from "./partition.js";

/**
 * Produce the layers of a repository (§4.3–§4.5, plan 4.5).
 *
 * - **Declared layers** (`declared` present; the `layers` configuration section): exact. Members are the
 *   `source` files the globs matched, the first layer in list order keeps a file several layers match,
 *   overlaps and layers without a match are `configuration-warning`s, ranks come from the configuration,
 *   and nothing is inferred (D-50, D-71) [DERIVED]. `inference.layers.enabled` does not apply.
 * - **Inferred layers** [KATEDRALA HEURISTIC], unless `settings.layers.enabled` is false:
 *   1. membership: the files whose `FileLabel.label` names the layer, pruned below `min_layer_files` unless a
 *      location, configuration or detector vote places a member; fewer than two layers give none;
 *   2. the layer graph on the `source` files with the metrics projection's edge kinds and the module
 *      weighting, type-only references at `type_only_weight` (D-51);
 *   3. strongly connected sets ordered exactly up to `exact_order_max_layers` layers (D-52), greedily beyond;
 *      conventional arcs between layers that share a package and that no observed path orders (D-53); ranks
 *      by longest path from the layers nothing depends on;
 *   4. confidence, evidence and reason per layer, with `settings.methods.layers` as the method (D-56).
 *
 * Layers are returned by rank, then id, without `dependencies` and `dependents` (the pipeline aggregates
 * them on the metrics projection). Inferred layers produce no diagnostics.
 *
 * Complexity: O(F log F + m_IR + Σ 2^k k² + L² · (L + E_H)) for F files, m_IR relationships, L layers and
 * strongly connected sets of k layers (k ≤ exact_order_max_layers). Determinism: see the steps.
 */
export function inferLayers(input: LayersInput): LayersResult {
  const { model, settings, projection, labels, declared, limits, configurationFile } = input;
  // §4.4, D-50: declaring layers disables layer inference.
  if (declared !== undefined) return declaredLayers(model, declared, limits, configurationFile);
  if (!settings.layers.enabled) return { layers: [], diagnostics: [] };
  const partition = partitionLayers(model, labels, settings.layers.minLayerFiles);
  if (partition.layers.length === 0) return { layers: [], diagnostics: [] };
  // D-51: the edge kinds of the metrics projection, the weighting of module inference.
  const graph = buildLayerGraph(model, partition, {
    typeOnlyWeight: settings.weighting.typeOnlyWeight,
    minEdgeConfidence: settings.weighting.minEdgeConfidence,
    edgeKinds: projection.edgeKinds ?? new Set(DEFAULT_EDGE_KINDS),
  });
  // D-53 (review #22): files without a package share the package "".
  const packages = partition.members.map(
    (files) => new Set(files.map((file) => model.index.file(file)?.package ?? "")),
  );
  const order = orderLayers(graph, {
    tiers: settings.vocabulary.tiers,
    exactOrderMaxLayers: settings.layers.exactOrderMaxLayers,
    packages,
  });
  const explanations = explainLayers({
    partition,
    graph,
    order,
    labels,
    vocabulary: settings.vocabulary,
    method: settings.methods.layers,
    maxEntities: limits.maxEvidenceEntities,
  });
  const layers = partition.layers.flatMap((name, index): LayerDraft[] => {
    const inference = explanations[index];
    const rank = order.ranks[index];
    if (inference === undefined || rank === undefined) return [];
    // Keys in the order of the IR's LayerEntity.
    return [
      {
        id: layerId(name),
        name,
        origin: "inferred",
        rank,
        files: [...(partition.members[index] ?? [])],
        inference,
      },
    ];
  });
  layers.sort((a, b) => a.rank - b.rank || compareStrings(a.id, b.id));
  return { layers, diagnostics: [] };
}
