/**
 * The reference stage: binds every reference of every file and turns each binding into an observation
 * whose edge kind follows from the reference kind and the kind of the resolved target; and the fact stage:
 * environment reads, HTTP requests and conventional entry points.
 */
import { fileId, roundMetric } from "@katedrala/ir";
import type {
  EdgeKind,
  EdgeMechanism,
  EntryPointEntry,
  NodeId,
  Provenance,
  ResolutionMethod,
} from "@katedrala/ir";
import type { ExtractedReference, ReferenceKind, ReferenceTarget } from "@katedrala/plugin-api";
import type { Binder, Bound, Position } from "./binder.js";
import { isConstructible, isDataModule, pickSymbol, positionOf } from "./binder.js";
import type { ExternalRegistry } from "./externals.js";
import type { FileRecord, Observation, SymbolRecord } from "./model.js";

const REFERENCE_KINDS: ReadonlySet<string> = new Set<ReferenceKind>([
  "call",
  "new",
  "construct",
  "tagged-template",
  "macro",
  "extends",
  "implements",
  "embed",
  "derive",
  "type",
  "decorator",
  "jsx",
  "value",
]);

/** Whether a value is a reference kind of the plugin contract (extractions are data and may violate it). */
export function isReferenceKind(kind: string): kind is ReferenceKind {
  return REFERENCE_KINDS.has(kind);
}

/**
 * The edge kind of a reference: invocations are `calls`, except that invoking a class, struct or record is
 * an instantiation (only when the target was resolved completely: a partially resolved member path names a
 * container of the invoked member, not the invoked entity), and that an invocation whose target is a file
 * no adapter analyzes (data, styles, assets) is a `uses`: what is invoked was read from the file.
 *
 * @param data - whether the target is such a file.
 */
export function edgeKindOf(
  kind: ReferenceKind,
  target: SymbolRecord | undefined,
  partial: boolean,
  data = false,
): EdgeKind {
  switch (kind) {
    case "call":
    case "tagged-template":
    case "macro":
      if (data) return "uses";
      return !partial && target !== undefined && isConstructible(target) ? "instantiates" : "calls";
    case "new":
    case "construct":
      return data ? "uses" : "instantiates";
    case "extends":
    case "embed":
      return "extends";
    case "implements":
    case "derive":
      return "implements";
    case "type":
      return "references-type";
    case "decorator":
      return "decorated-by";
    case "jsx":
    case "value":
      return "uses";
  }
}

/** The syntactic mechanism of a reference kind. */
export function mechanismOf(kind: ReferenceKind): EdgeMechanism {
  switch (kind) {
    case "call":
    case "macro":
      return "call-expression";
    case "new":
    case "construct":
      return "new-expression";
    case "tagged-template":
      return "tagged-template";
    case "extends":
    case "embed":
      return "extends-clause";
    case "implements":
    case "derive":
      return "implements-clause";
    case "type":
      return "type-annotation";
    case "decorator":
      return "decorator";
    case "jsx":
      return "jsx-element";
    case "value":
      return "value-reference";
  }
}

/** Local variables and parameters (also as the root of an instance) never bind and are never counted. */
export function isLocalTarget(target: ReferenceTarget): boolean {
  if (target.type === "local" || target.type === "parameter") return true;
  return target.type === "instance" && isLocalTarget(target.of);
}

/** The source of an observation in a file: the enclosing symbol, else the file itself. */
export function sourceOf(file: FileRecord, from: string | undefined): NodeId {
  if (from === undefined) return file.id;
  return file.symbolsByLocalName.get(from)?.id ?? file.id;
}

interface TargetNode {
  readonly node: NodeId;
  readonly symbol?: SymbolRecord;
  readonly detail?: string;
  /** The node is a file no adapter analyzes (see {@link edgeKindOf}). */
  readonly data?: true;
}

function targetNodes(binding: Bound, position: Position): TargetNode[] {
  const denotation = binding.denotation;
  const partialDetail =
    binding.unresolvedPath === undefined
      ? undefined
      : `unresolved member path: ${binding.unresolvedPath.join(".")}`;
  switch (denotation.type) {
    case "symbols": {
      const symbol = pickSymbol(denotation.symbols, position);
      if (symbol === undefined) return [];
      return [
        partialDetail === undefined
          ? { node: symbol.id, symbol }
          : { node: symbol.id, symbol, detail: partialDetail },
      ];
    }
    case "module": {
      // The member path reached inside a file without an extraction, which cannot be looked up.
      const path = denotation.path ?? [];
      const detail = partialDetail ?? (path.length > 0 ? path.join(".") : undefined);
      const data = isDataModule(denotation.files);
      return denotation.files.map((file) => ({
        node: file.id,
        ...(detail === undefined ? {} : { detail }),
        ...(data ? { data: true as const } : {}),
      }));
    }
    case "external": {
      const detail =
        partialDetail ?? (denotation.path.length > 0 ? denotation.path.join(".") : undefined);
      // Several when external star modules may each provide the name.
      return [denotation.external, ...(denotation.alternatives ?? [])].map((external) =>
        detail === undefined ? { node: external.id } : { node: external.id, detail },
      );
    }
  }
}

/** The final resolution step; a binding followed through re-exporting files is a re-export chain. */
function finalMethod(binding: Bound): ResolutionMethod {
  return (binding.method === "import-binding" || binding.method === "namespace-member") &&
    binding.via.length > 0
    ? "re-export-chain"
    : binding.method;
}

/** Result of {@link bindReferences}. */
export interface ReferenceStageResult {
  readonly observations: readonly Observation[];
  /** References that could not be bound although a binding should exist. */
  readonly unresolved: number;
  /** References to members of values whose type cannot be determined (nothing bound, not an error). */
  readonly untyped: number;
}

function observe(
  file: FileRecord,
  reference: ExtractedReference,
  kind: ReferenceKind,
  binding: Bound,
  target: TargetNode,
  source: NodeId,
): Observation {
  const provenance: Provenance = {
    file: file.id,
    line: reference.line,
    column: reference.column,
    mechanism: mechanismOf(kind),
    resolution: finalMethod(binding),
    confidence: roundMetric(binding.confidence),
    ...(reference.typeOnly ? { typeOnly: true } : {}),
    ...(binding.via.length > 0 ? { via: binding.via.map((path) => fileId(path)) } : {}),
    ...(target.detail === undefined ? {} : { detail: target.detail }),
  };
  return {
    kind: edgeKindOf(kind, target.symbol, binding.unresolvedPath !== undefined, target.data),
    source,
    target: target.node,
    provenance,
  };
}

/**
 * Bind the references of every file (in the given order). Self-references (recursion) produce no
 * observation but count as resolved. References that bind nothing count as untyped or unresolved, except
 * those that may be provided by files excluded from the analysis or code that was not analyzed: their
 * bindings may well exist but cannot be looked up.
 */
export function bindReferences(files: readonly FileRecord[], binder: Binder): ReferenceStageResult {
  const observations: Observation[] = [];
  let unresolved = 0;
  let untyped = 0;
  for (const file of files) {
    for (const reference of file.extraction?.references ?? []) {
      const kind = reference.kind;
      if (!isReferenceKind(kind) || isLocalTarget(reference.target)) continue;
      const source = sourceOf(file, reference.from);
      const position = positionOf(kind);
      let resolved = false;
      const outcome = binder.resolveReference(file, reference.target, reference.from);
      for (const binding of outcome.bounds) {
        for (const target of targetNodes(binding, position)) {
          resolved = true;
          if (target.node === source) continue;
          observations.push(observe(file, reference, kind, binding, target, source));
        }
      }
      if (resolved) continue;
      if (outcome.untyped) untyped++;
      else if (!outcome.excluded) unresolved++;
    }
  }
  return { observations, unresolved, untyped };
}

/** Result of {@link collectFacts}. */
export interface FactStageResult {
  readonly observations: readonly Observation[];
  readonly entryPoints: readonly EntryPointEntry[];
}

/** Confidence that an HTTP request fact addresses the service named by its host. */
export const HTTP_REQUEST_CONFIDENCE = 0.9;

/**
 * Turn facts into externals and observations: `environment-read` → `reads-configuration` an environment
 * variable; `http-request` with a host → `calls-service` an HTTP service; `entry-point` → a conventional
 * entry point.
 *
 * @param includeSymbols - whether entry points may name symbols (false when the document omits symbols).
 */
export function collectFacts(
  files: readonly FileRecord[],
  externals: ExternalRegistry,
  includeSymbols: boolean,
): FactStageResult {
  const observations: Observation[] = [];
  const entryPoints: EntryPointEntry[] = [];
  for (const file of files) {
    for (const fact of file.extraction?.facts ?? []) {
      const source = sourceOf(file, fact.from);
      const location = { file: file.id, line: fact.line, column: fact.column };
      if (fact.type === "environment-read") {
        const name = fact.attributes.name;
        const external =
          name === undefined ? undefined : externals.register("environment-variable", "env", name);
        if (external === undefined) continue;
        observations.push({
          kind: "reads-configuration",
          source,
          target: external.id,
          provenance: {
            ...location,
            mechanism: "environment-read",
            resolution: "global-scope",
            confidence: 1,
          },
        });
      } else if (fact.type === "http-request") {
        const host = fact.attributes.host;
        const external =
          host === undefined ? undefined : externals.register("service", "http", host);
        if (external === undefined) continue;
        const detail = [fact.attributes.method, fact.attributes.url]
          .filter((part): part is string => part !== undefined && part !== "")
          .join(" ");
        observations.push({
          kind: "calls-service",
          source,
          target: external.id,
          provenance: {
            ...location,
            mechanism: "http-request",
            resolution: "global-scope",
            confidence: HTTP_REQUEST_CONFIDENCE,
            ...(detail === "" ? {} : { detail }),
          },
        });
      } else if (fact.type === "entry-point") {
        const symbol =
          includeSymbols && fact.from !== undefined
            ? file.symbolsByLocalName.get(fact.from)
            : undefined;
        entryPoints.push({
          entity: symbol?.id ?? file.id,
          kind: "convention",
          source: file.adapterId ?? "unknown",
          ...(file.packageId === undefined ? {} : { package: file.packageId }),
        });
      }
    }
  }
  return { observations, entryPoints };
}
