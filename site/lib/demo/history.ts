/**
 * Five versions of the demonstration system, as Katedrala's history analysis would compare them: the system
 * grows module by module, then two commits bend its structure. Entropy is computed for every version.
 */
import { counted, listed } from "@/lib/text";
import { entropyOf, type EntropyResult } from "./entropy";
import { moduleMeasurementOf } from "./metrics";
import { EDGES, MODULES, NODES, moduleName, type ModuleId } from "./system";

export interface Version {
  readonly tag: string;
  readonly title: string;
  readonly members: readonly string[];
  readonly edges: readonly (readonly [string, string])[];
  /** What Katedrala reports as new in this version: the modules that arrived, or the dependencies added. */
  readonly change: string;
  /** A structural finding in this version, when there is one. */
  readonly finding?: string;
  /** The module cycle a new dependency closed in this version, as a path that returns to its start. */
  readonly cycle?: readonly ModuleId[];
  /** The new module dependency that runs up the load path, when this version adds one and closes no cycle. */
  readonly upward?: readonly [ModuleId, ModuleId];
  readonly entropy: EntropyResult;
  readonly modules: readonly ModuleId[];
  /** Module dependencies new in this version; none in the first, which has nothing to compare against. */
  readonly newModuleEdges: ReadonlySet<string>;
}

const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
const base = EDGES.map((e) => [e.source, e.target] as const);
const within = (members: readonly string[]) => {
  const set = new Set(members);
  return base.filter(([s, t]) => set.has(s) && set.has(t));
};

const V1 = [
  "ApiGateway",
  "AuthService",
  "SessionStore",
  "UserService",
  "UserRepository",
  "Database",
];
const V2 = [...V1, "PaymentService", "PaymentRepository", "StripeClient"];
const ALL = NODES.map((n) => n.id);

type Draft = Pick<Version, "tag" | "title" | "members" | "edges">;

const raw: readonly Draft[] = [
  { tag: "v1", title: "Clean boundaries", members: V1, edges: within(V1) },
  { tag: "v2", title: "Payments", members: V2, edges: within(V2) },
  { tag: "v3", title: "Orders", members: ALL, edges: base },
  {
    tag: "v4",
    title: "Against the load path",
    members: ALL,
    edges: [...base, ["PaymentService", "AuthService"]],
  },
  {
    tag: "v5",
    title: "A cycle",
    members: ALL,
    edges: [...base, ["PaymentService", "AuthService"], ["UserRepository", "OrderService"]],
  },
];

const modulesOf = (members: readonly string[]) => new Set(members.map((m) => moduleOf.get(m)!));
/** Module names in the order the system lists them, so every list of modules reads the same way. */
const moduleNames = (ids: ReadonlySet<ModuleId>) =>
  MODULES.filter((module) => ids.has(module.id)).map((module) => module.name);

/**
 * The change line, computed from two consecutive versions: the modules that arrived and how many members came
 * with them, or, when no member is new, each dependency added. The first version lists its modules.
 */
function changeOf(version: Draft, previous: Draft | undefined): string {
  if (previous === undefined) return listed(moduleNames(modulesOf(version.members)));
  const known = new Set(previous.members);
  const arrived = version.members.filter((member) => !known.has(member));
  if (arrived.length > 0) {
    const existing = modulesOf(previous.members);
    const names = moduleNames(new Set([...modulesOf(arrived)].filter((id) => !existing.has(id))));
    const modules =
      names.length === 0 ? "" : `${listed(names)} ${names.length === 1 ? "module" : "modules"}, `;
    return `+ ${modules}${counted(arrived.length, "member")}`;
  }
  const edges = new Set(previous.edges.map(([s, t]) => `${s}>${t}`));
  return version.edges
    .filter(([s, t]) => !edges.has(`${s}>${t}`))
    .map(([s, t]) => `+ ${s} → ${t}`)
    .join(", ");
}

const moduleEdgesOf = (edges: readonly (readonly [string, string])[]) =>
  new Set(
    edges
      .map(([s, t]) => [moduleOf.get(s)!, moduleOf.get(t)!] as const)
      .filter(([a, b]) => a !== b)
      .map(([a, b]) => `${a}>${b}`),
  );

/**
 * The shortest cycle that a new module dependency closes: the dependency itself, then the shortest path back
 * (breadth-first, neighbors in name order, so the answer is the same on every run). Undefined when the
 * dependency closes no cycle.
 */
function cycleClosedBy(
  [source, target]: readonly [ModuleId, ModuleId],
  edges: ReadonlySet<string>,
): ModuleId[] | undefined {
  const out = new Map<ModuleId, ModuleId[]>();
  for (const key of [...edges].sort()) {
    const [a, b] = key.split(">") as [ModuleId, ModuleId];
    out.set(a, [...(out.get(a) ?? []), b]);
  }
  const previous = new Map<ModuleId, ModuleId>();
  const queue: ModuleId[] = [target];
  const seen = new Set<ModuleId>([target]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) {
      const path: ModuleId[] = [source];
      for (let step = source; step !== target;) {
        step = previous.get(step)!;
        path.unshift(step);
      }
      return [source, ...path];
    }
    for (const next of out.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, current);
      queue.push(next);
    }
  }
  return undefined;
}

export const VERSIONS: readonly Version[] = raw.map((version, i) => {
  const current = moduleEdgesOf(version.edges);
  const entropy = entropyOf(version.edges, version.members);
  // The first version is the baseline: nothing in it is new, so nothing in it is flagged.
  const previous = i === 0 ? current : moduleEdgesOf(raw[i - 1]!.edges);
  const added = [...current].filter((edge) => !previous.has(edge));
  // Findings are computed: a cycle a new dependency closes, else a new dependency that climbs the load path,
  // from a module to one drawn above it.
  const pairs = added.map((edge) => edge.split(">") as [ModuleId, ModuleId]);
  const cycle = pairs
    .map((pair) => cycleClosedBy(pair, current))
    .find((path) => path !== undefined);
  const upward = pairs.find(
    ([a, b]) => moduleMeasurementOf(b).level > moduleMeasurementOf(a).level,
  );
  const finding =
    cycle !== undefined
      ? `New cycle: ${cycle.map((m) => moduleName(m)).join(" → ")}.`
      : upward !== undefined
        ? // No-break spaces keep the pair on one line.
          `New upward dependency: ${moduleName(upward[0])}\u00a0→\u00a0${moduleName(upward[1])}.`
        : undefined;
  return {
    ...version,
    change: changeOf(version, raw[i - 1]),
    ...(finding === undefined ? {} : { finding }),
    ...(cycle === undefined ? {} : { cycle }),
    ...(cycle === undefined && upward !== undefined ? { upward } : {}),
    entropy,
    modules: [...new Set(version.members.map((m) => moduleOf.get(m)!))],
    newModuleEdges: new Set(added),
  };
});

export function moduleEdgeList(version: Version): (readonly [ModuleId, ModuleId])[] {
  return [...moduleEdgesOf(version.edges)].map(
    (key) => key.split(">") as unknown as readonly [ModuleId, ModuleId],
  );
}
