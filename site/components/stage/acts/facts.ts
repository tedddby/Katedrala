/**
 * The acts' facts as the server states them: Act II's evidence and the repository's counts (the evidence JSON), Act
 * III's subject and its trace in every scope, the landing's file list and the files to start from (the graph JSON,
 * through the model and trace.ts). Server only: it reads both data files, which never enter a client bundle. Computed
 * once per build.
 */
import evidence from "@/public/data/codeverse-evidence.json";
import { codeverse } from "../codeverse";
import type { ChangeFacts, EvidenceStats } from "./copy";
import { actPayload, type EvidencePayload } from "./payload";
import { listing, pathTo, reachOf, trace, traceGraph, type TraceGraph } from "./trace";

/** How many relationship kinds the closing caption names (the rest are counted together). */
const NAMED_KINDS = 4;

interface Facts {
  readonly evidence: EvidencePayload;
  readonly stats: EvidenceStats;
  readonly change: ChangeFacts;
  readonly graph: TraceGraph;
  /** The landing's file list: every source file, by folder. */
  readonly folders: readonly { readonly folder: string; readonly files: readonly number[] }[];
  /** The files to start from: the crown, then the three foundations the most files rest on. */
  readonly picks: readonly number[];
  readonly paths: readonly string[];
  readonly repository: string;
  readonly commit: string;
  readonly sourceFiles: number;
}

let cached: Facts | null = null;

export function actFacts(): Facts {
  if (cached !== null) return cached;
  const { data, model, summary } = codeverse();
  const graph = traceGraph(data);
  const kinds = Object.entries(evidence.edgeKinds).sort(
    (p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1),
  );
  const stats: EvidenceStats = {
    ...evidence.stats,
    named: kinds.slice(0, NAMED_KINDS),
    others: kinds.slice(NAMED_KINDS),
    chains: summary.dependencies,
  };
  if (kinds.reduce((sum, [, n]) => sum + n, 0) !== stats.edges) {
    throw new Error("the edge kinds do not add up to the relationships");
  }
  const subject = model.heaviest[0] ?? 0;
  const up = trace(graph, subject, "up", "runtime");
  const change: ChangeFacts = {
    path: model.paths[subject]!,
    lines: model.lines[subject]!,
    foundation: model.foundation[subject] === 1,
    steps: up.layers.slice(1).map((layer) => layer.length),
    reach: reachOf(graph, subject, "up"),
    sourceFiles: summary.sourceFiles,
    crownPath: pathTo(up, model.crown).map((v) => model.paths[v]!),
  };
  cached = {
    evidence: actPayload().evidence,
    stats,
    change,
    graph,
    folders: listing(graph),
    picks: [model.crown, ...model.heaviest.slice(0, 3)],
    paths: model.paths,
    repository: summary.repository,
    commit: summary.commit,
    sourceFiles: summary.sourceFiles,
  };
  return cached;
}
