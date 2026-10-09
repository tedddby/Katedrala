// Type test: the model's GraphData (as the server shell casts the imported JSON, and as the director fetches it)
// is accepted by traceGraph; a TraceMask feeds the stage's setLit and extends to the act interface's LitMask.
import graph from "@/public/data/codeverse-graph.json";
import { buildModel, type GraphData } from "@/components/lab/cinematic/model";
import {
  fileOf,
  listing,
  pathMask,
  reachOf,
  trace,
  traceGraph,
  traceMask,
  within,
  type TraceMask,
} from "@/components/stage/acts/trace";

const data = graph as unknown as GraphData;
const fetched: Promise<GraphData> = Promise.resolve(data);
void fetched.then((d) => traceGraph(d));
const g = traceGraph(data);
const model = buildModel(data);
const t = trace(g, fileOf(g, "src/graph/model/types.ts"), "up", "runtime");
const reuse: TraceMask = { nodes: new Uint8Array(model.n), edges: new Uint8Array(model.m) };
const mask: TraceMask = traceMask(t, { upTo: 2, tree: true, into: reuse });
interface LitMask {
  readonly nodes: Uint8Array;
  readonly edges: Uint8Array;
  readonly dim: number;
}
const lit: LitMask = { ...mask, dim: 0.15 };
const setLit = (nodes: Uint8Array | null, edges: Uint8Array | null, dim: number) => [nodes, edges, dim];
setLit(lit.nodes, lit.edges, lit.dim);
setLit(pathMask(t, 0).nodes, pathMask(t, 0, reuse).edges, 0.8);
export const n: number = within(t, 3) + listing(g).length + reachOf(g, 0, "down").runtime;
