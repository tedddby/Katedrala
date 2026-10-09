/**
 * What the server computes for Acts II, III and the landing and hands to the browser with the page (Film.tsx passes
 * it to the film's client island; each act reads it as ActContext.payload): Act II's evidence, as
 * public/data/codeverse-evidence.json records it, reduced to what its drawing places (the two files, their symbols'
 * ranges, the seven observations and the record's lines). Small and serializable; the graph never travels this way
 * (the browser fetches it once, for the model, and Act III and the landing trace it there).
 *
 * Server only in effect: client modules import its types, never its values (the evidence JSON stays out of every
 * client bundle).
 */
import evidence from "@/public/data/codeverse-evidence.json";
import { REAL_EDGE } from "@/lib/site";

/** One of the two files of Act II's dependency. */
export interface EvidenceFile {
  readonly path: string;
  readonly lines: number;
  readonly symbols: number;
  readonly level: number;
}

/** A symbol of either file, with the lines it spans. */
export interface EvidenceSymbol {
  readonly name: string;
  readonly kind: string;
  /** Which end of the dependency declares it. */
  readonly side: "dependent" | "dependency";
  readonly from: number;
  readonly to: number;
  readonly exported: boolean;
}

/** One observation behind the dependency: where in the dependent it was seen and what it binds to. */
export interface EvidenceObservation {
  readonly line: number;
  readonly column: number;
  /** The relationship's kind ("imports", "calls"). */
  readonly kind: string;
  /** The dependency's symbol it binds to, or null when it binds to the file itself (an import). */
  readonly target: string | null;
  /** How it was seen and how it was resolved ("call-expression", "import-binding"). */
  readonly mechanism: string;
  readonly resolution: string;
  /** Part of the relationship the record shows (REAL_EDGE). */
  readonly recorded: boolean;
}

export interface EvidencePayload {
  readonly repository: string;
  readonly commit: string;
  readonly dependent: EvidenceFile;
  readonly dependency: EvidenceFile;
  readonly symbols: readonly EvidenceSymbol[];
  /** In line order. */
  readonly observations: readonly EvidenceObservation[];
  /** The record as the page prints it (REAL_EDGE, two-space JSON). */
  readonly record: string;
  /** For each of the record's observations, the 1-based line of the record that carries its "line" entry. */
  readonly recordLines: readonly { readonly line: number; readonly at: number }[];
}

export interface ActPayload {
  readonly evidence: EvidencePayload;
}

const nameOf = (id: string) => id.slice(id.lastIndexOf("#") + 1);

/** The record's text, as the narration block and the frame show it. */
export function recordText(): string {
  return JSON.stringify(REAL_EDGE, null, 2);
}

export function actPayload(): ActPayload {
  const { dependent, dependency } = evidence;
  const sideOf = (fileId: string) => (fileId === dependent.id ? "dependent" : "dependency");
  const observations: EvidenceObservation[] = evidence.relationships
    .flatMap((r) =>
      r.provenance.map((p) => ({
        line: p.line,
        column: p.column,
        kind: r.kind,
        target: r.target.startsWith("sym:") ? nameOf(r.target) : null,
        mechanism: p.mechanism,
        resolution: p.resolution,
        recorded: r.id === evidence.realEdge,
      })),
    )
    .sort((p, q) => p.line - q.line || p.column - q.column);
  const record = recordText();
  const rows = record.split("\n");
  const recordLines = REAL_EDGE.provenance.map((p) => ({
    line: p.line,
    at: rows.findIndex((row) => row.trim() === `"line": ${p.line},`) + 1,
  }));
  if (recordLines.some((r) => r.at === 0)) throw new Error("the record does not show its lines");
  return {
    evidence: {
      repository: evidence.source.repository,
      commit: evidence.source.commit,
      dependent: {
        path: dependent.path,
        lines: dependent.lines,
        symbols: dependent.symbolCount,
        level: dependent.level,
      },
      dependency: {
        path: dependency.path,
        lines: dependency.lines,
        symbols: dependency.symbolCount,
        level: dependency.level,
      },
      symbols: evidence.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        side: sideOf(s.file),
        from: s.range.start.line,
        to: s.range.end.line,
        exported: s.exported,
      })),
      observations,
      record,
      recordLines,
    },
  };
}
