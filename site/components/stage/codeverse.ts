/**
 * Katedrala's analysis of CodeVerse as the server reads it: the graph data, the hanging model built from it (the
 * layout iterations run once per build) and the summary every caption, count and note is computed from. Server only:
 * it imports public/data/codeverse-graph.json, which must never enter a client bundle (the browser fetches it once,
 * for the model, and rebuilds the model with the server's rest positions).
 */
import graph from "@/public/data/codeverse-graph.json";
import {
  buildModel,
  summarize,
  type GraphData,
  type HangingModel,
  type StructureSummary,
} from "./model";

let cached: { data: GraphData; model: HangingModel; summary: StructureSummary } | null = null;

export function codeverse(): {
  readonly data: GraphData;
  readonly model: HangingModel;
  readonly summary: StructureSummary;
} {
  if (cached === null) {
    const data = graph as unknown as GraphData;
    const model = buildModel(data);
    cached = { data, model, summary: summarize(model, data) };
  }
  return cached;
}
