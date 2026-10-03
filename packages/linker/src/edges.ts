/**
 * Aggregation of observations into edges: one edge per (kind, source, target) with every observation
 * counted, provenance in canonical order and truncated, `typeOnly` when every observation is type-only, and
 * the maximum observation confidence.
 */
import { compareEdges, compareProvenance, edgeId, roundMetric } from "@katedrala/ir";
import type { EdgeEntity, EdgeKind, NodeId, Provenance } from "@katedrala/ir";
import type { Observation } from "./model.js";

/** Options of {@link aggregateEdges}. */
export interface AggregateOptions {
  /**
   * Maps endpoints before aggregation (e.g. lifting symbols to their files). Observations whose endpoints
   * become equal are dropped.
   */
  readonly lift?: (node: NodeId) => NodeId;
  /** Maximum provenance entries per edge; null keeps every observation. */
  readonly maxProvenancePerEdge: number | null;
}

interface Group {
  readonly kind: EdgeKind;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly provenance: Provenance[];
}

/** Aggregate observations into edges sorted by source, target and kind. Self-loops are never emitted. */
export function aggregateEdges(
  observations: Iterable<Observation>,
  options: AggregateOptions,
): EdgeEntity[] {
  const lift = options.lift;
  const groups = new Map<string, Group>();
  for (const observation of observations) {
    const source = lift === undefined ? observation.source : lift(observation.source);
    const target = lift === undefined ? observation.target : lift(observation.target);
    if (source === target) continue;
    const key = `${observation.kind}\u0000${source}\u0000${target}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        kind: observation.kind,
        source,
        target,
        provenance: [observation.provenance],
      });
    } else {
      group.provenance.push(observation.provenance);
    }
  }
  const limit =
    options.maxProvenancePerEdge === null
      ? undefined
      : Math.max(0, Math.floor(options.maxProvenancePerEdge));
  const edges: EdgeEntity[] = [];
  for (const group of groups.values()) {
    const provenance = group.provenance.sort(compareProvenance);
    let confidence = 0;
    let typeOnly = true;
    for (const item of provenance) {
      if (item.confidence > confidence) confidence = item.confidence;
      if (item.typeOnly !== true) typeOnly = false;
    }
    edges.push({
      id: edgeId(group.kind, group.source, group.target),
      kind: group.kind,
      source: group.source,
      target: group.target,
      observations: provenance.length,
      typeOnly,
      confidence: roundMetric(confidence),
      provenance: limit === undefined ? provenance : provenance.slice(0, limit),
    });
  }
  return edges.sort(compareEdges);
}
