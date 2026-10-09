import { compareStrings, inferredModuleKey } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveInferenceSettings } from "../settings.js";
import { prototypeModel, syntheticModel } from "../test-support.js";
import type { SyntheticEdgeSpec } from "../test-support.js";
import type { ClusterUnit, DeclaredModuleSpec, ScopeClustering, UnitKind } from "../types.js";
import { MODULE_SIGNAL_WEIGHTS, moduleSignals, signalValue } from "./confidence.js";
import type { ModuleSignal, UnitSignals } from "./confidence.js";
import {
  DEPENDENCY_VIOLATIONS_DECLARED,
  DESIGN_CLUSTERINGS,
} from "./design-clusterings.test-support.js";
import {
  METRICS_PROJECTION,
  entryPointFiles,
  handClustering,
  handStage,
} from "./hand-built.test-support.js";
import type { HandClusteringSpec } from "./hand-built.test-support.js";
import { moduleScopes } from "./scopes.js";

const KINDS: readonly UnitKind[] = ["feature", "stem", "split", "layer", "shared", "root"];

/** Σ weight × value of a unit's kind (D-45: an absent value counts 0). */
function confidenceOf(kind: UnitKind, signals: UnitSignals): number {
  let sum = 0;
  for (const { signal, weight } of MODULE_SIGNAL_WEIGHTS[kind]) {
    sum += weight * (signalValue(signals, signal) ?? 0);
  }
  return sum;
}

/** The measurements of every unit of a design fixture, by module key. */
function designSignals(name: string): Map<string, { unit: ClusterUnit; signals: UnitSignals }> {
  const model = prototypeModel(name);
  const design = DESIGN_CLUSTERINGS[name];
  if (design === undefined) throw new Error(`no design clustering for ${name}`);
  const declared: DeclaredModuleSpec[] =
    name === "dependency-violations"
      ? Object.entries(DEPENDENCY_VIOLATIONS_DECLARED).map(([module, prefix]) => ({
          name: module,
          files: model.document.files
            .filter((file) => file.path.startsWith(prefix))
            .map((file) => file.id)
            .sort(compareStrings),
        }))
      : [];
  const stage = handStage(model, () => design, { declared });
  const [scoped] = stage.inferred;
  if (scoped === undefined) throw new Error("no scope");
  const signals = moduleSignals(scoped.clustering, entryPointFiles(model));
  return new Map(
    scoped.clustering.units.map((unit, index) => [
      unit.key,
      { unit, signals: signals[index] as UnitSignals },
    ]),
  );
}

describe("MODULE_SIGNAL_WEIGHTS (§3.13)", () => {
  it("lists a fixed set of signals per kind whose weights sum to 1", () => {
    const cohesion = ["internal-edge-ratio", "membership-margin", "prior-agreement", "module-size"];
    expect(MODULE_SIGNAL_WEIGHTS.feature.map((entry) => entry.signal)).toEqual(cohesion);
    expect(MODULE_SIGNAL_WEIGHTS.stem).toBe(MODULE_SIGNAL_WEIGHTS.feature);
    expect(MODULE_SIGNAL_WEIGHTS.split).toBe(MODULE_SIGNAL_WEIGHTS.feature);
    expect(MODULE_SIGNAL_WEIGHTS.feature.map((entry) => entry.weight)).toEqual([
      0.4, 0.25, 0.2, 0.15,
    ]);
    expect(MODULE_SIGNAL_WEIGHTS.layer).toEqual([
      { signal: "internal-edge-ratio", weight: 0.5 },
      { signal: "prior-agreement", weight: 0.3 },
      { signal: "module-size", weight: 0.2 },
    ]);
    expect(MODULE_SIGNAL_WEIGHTS.shared).toEqual([
      { signal: "shared-usage", weight: 0.5 },
      { signal: "prior-agreement", weight: 0.3 },
      { signal: "module-size", weight: 0.2 },
    ]);
    expect(MODULE_SIGNAL_WEIGHTS.root).toEqual([
      { signal: "wiring-share", weight: 0.3 },
      { signal: "prior-agreement", weight: 0.5 },
      { signal: "module-size", weight: 0.2 },
    ]);
    for (const kind of KINDS) {
      const total = MODULE_SIGNAL_WEIGHTS[kind].reduce((sum, entry) => sum + entry.weight, 0);
      expect(total, kind).toBeCloseTo(1, 12);
      expect(Object.isFrozen(MODULE_SIGNAL_WEIGHTS[kind])).toBe(true);
    }
    expect(Object.isFrozen(MODULE_SIGNAL_WEIGHTS)).toBe(true);
  });
});

describe("moduleSignals on the design's prototype graphs (§3.13, §3.16)", () => {
  it("replays §3.13's worked example: mod:src#payment 0.807", () => {
    const payment = designSignals("layered-architecture").get("src#payment");
    expect(payment?.signals).toMatchObject({
      files: 5,
      internalWeight: 4.5,
      cutWeight: 3,
      internalEdgeRatio: 0.75,
      membersWithEvidence: 5,
      membershipMargin: 0.8,
      retained: 5,
      union: 5,
      priorAgreement: 1,
      moduleSize: 5 / 7,
    });
    // `services/payment.service.ts` is used by payments 1.0 and orders 1.0: margin 0.
    expect(payment?.signals.contested).toHaveLength(1);
    expect(confidenceOf("stem", payment?.signals as UnitSignals)).toBeCloseTo(0.807142857, 9);
  });

  const expected: Record<string, Record<string, number>> = {
    "layered-architecture": {
      "src#payment": 0.807,
      "src#order": 0.888,
      "src#user": 0.73,
      "src/shared": 0.843,
      src: 0.867,
    },
    "ambiguous-boundaries": {
      "src/cart": 0.844,
      "src/catalog": 0.801,
      "src/checkout": 0.894,
      "src/common": 0.558,
      src: 0.867,
    },
    "clean-architecture": {
      "src/application": 0.551,
      "src/domain": 0.78,
      "src/infrastructure": 0.6,
      "src/presentation": 0.797,
      src: 0.867,
    },
    "tangled-architecture": {
      "src/cart": 0.551,
      "src/catalog": 0.644,
      "src/checkout": 0.548,
      "src/customers": 0.576,
      "src/inventory": 0.695,
      "src/lib": 0.92,
      src: 0.867,
    },
    "dependency-violations": {
      "src#customer": 0.751,
      "src#order": 0.68,
      "src#refund": 0.725,
      "src/repositories": 0.367,
      src: 0.75,
    },
  };

  for (const [fixture, modules] of Object.entries(expected)) {
    it(`reproduces §3.16's confidences of ${fixture}`, () => {
      const signals = designSignals(fixture);
      expect([...signals.keys()].sort(compareStrings)).toEqual(
        Object.keys(modules).sort(compareStrings),
      );
      for (const [key, confidence] of Object.entries(modules)) {
        const entry = signals.get(key);
        if (entry === undefined) throw new Error(key);
        expect(Number(confidenceOf(entry.unit.kind, entry.signals).toFixed(3)), key).toBe(
          confidence,
        );
      }
    });
  }

  it("counts each wiring member once (review #10): layered mod:src is 0.867, not 1.167", () => {
    const root = designSignals("layered-architecture").get("src");
    // `src/main.ts` is a composition root and a declared entry point.
    expect(root?.signals.wiringShare).toBe(1);
    expect(confidenceOf("root", root?.signals as UnitSignals)).toBeCloseTo(0.3 + 0.5 + 0.2 / 3, 12);
  });

  it("reproduces the design's other numbers: shared usage, single users, cohesion ranges", () => {
    expect(designSignals("layered-architecture").get("src/shared")?.signals.sharedUsage).toBe(0.8);
    const common = designSignals("ambiguous-boundaries").get("src/common");
    expect(common?.signals.sharedUsage).toBe(0.25);
    expect(common?.signals.singleUsers).toHaveLength(3);
    const application = designSignals("clean-architecture").get("src/application");
    expect(application?.signals.internalEdgeRatio?.toFixed(3)).toBe("0.235");
    // §3.16: tangled feature modules have internal-edge-ratio 0.39–0.73 and margins 0.21–0.40.
    for (const [key, { unit, signals }] of designSignals("tangled-architecture")) {
      if (unit.kind !== "feature") continue;
      expect(Number(signals.internalEdgeRatio?.toFixed(2)), key).toBeGreaterThanOrEqual(0.38);
      expect(Number(signals.internalEdgeRatio?.toFixed(2)), key).toBeLessThanOrEqual(0.73);
      expect(Number(signals.membershipMargin?.toFixed(2)), key).toBeGreaterThanOrEqual(0.21);
      expect(Number(signals.membershipMargin?.toFixed(2)), key).toBeLessThanOrEqual(0.4);
    }
    // §3.9: the three relocations, seen from prior agreement.
    const ambiguous = designSignals("ambiguous-boundaries");
    expect(ambiguous.get("src/checkout")?.signals).toMatchObject({ retained: 9, union: 12 });
    expect(ambiguous.get("src/cart")?.signals.movedOut).toHaveLength(1);
  });
});

/** A one-scope model with these edges and a clustering by the given spec. */
function scenario(
  files: readonly string[],
  edges: readonly SyntheticEdgeSpec[],
  spec: HandClusteringSpec,
  typeOnlyWeight = 0.5,
): { clustering: ScopeClustering; signals: Map<string, UnitSignals> } {
  const model = syntheticModel({ files, edges });
  const settings = resolveInferenceSettings({ modules: { type_only_weight: typeOnlyWeight } });
  const { scopes } = moduleScopes({
    model,
    settings,
    projection: METRICS_PROJECTION,
    declaredFiles: new Set(),
  });
  const [scope] = scopes;
  if (scope === undefined) throw new Error("no scope");
  const clustering = handClustering(scope, spec);
  const signals = moduleSignals(clustering, entryPointFiles(model));
  return {
    clustering,
    signals: new Map(
      clustering.units.map((unit, index) => [unit.key, signals[index] as UnitSignals]),
    ),
  };
}

describe("moduleSignals (P9)", () => {
  it("skips the arcs of composition roots and utilities (the evidence graph)", () => {
    const { signals } = scenario(
      ["a/a1.ts", "a/a2.ts", "b/b1.ts", "main.ts", "u/util.ts"],
      [
        { source: "a/a1.ts", target: "a/a2.ts" },
        { source: "a/a2.ts", target: "b/b1.ts", typeOnly: true },
        { source: "main.ts", target: "a/a1.ts" },
        { source: "a/a1.ts", target: "u/util.ts" },
      ],
      {
        units: [
          { anchor: { directory: "a" }, kind: "feature", members: ["a/a1.ts", "a/a2.ts"] },
          { anchor: { directory: "b" }, kind: "feature", members: ["b/b1.ts"] },
          { anchor: { directory: "" }, kind: "root", members: ["main.ts"] },
          { anchor: { directory: "u" }, kind: "shared", members: ["u/util.ts"] },
        ],
        orchestrators: { "main.ts": [1, 1] },
        utilities: { "u/util.ts": 2 },
      },
    );
    expect(signals.get("a")).toMatchObject({
      internalWeight: 1,
      cutWeight: 0.5,
      internalEdgeRatio: 0.8,
    });
    expect(signals.get("b")).toMatchObject({
      internalWeight: 0,
      cutWeight: 0.5,
      internalEdgeRatio: 0,
    });
    // D-45: no evidence arc, no value.
    for (const key of [".", "u"]) {
      expect(signals.get(key)?.internalEdgeRatio, key).toBeUndefined();
      expect(signals.get(key)?.membershipMargin, key).toBeUndefined();
      expect(signals.get(key)?.membersWithEvidence, key).toBe(0);
    }
  });

  it("measures margins on dependents, else dependencies, and contests exact ties (D-47)", () => {
    const { signals, clustering } = scenario(
      ["x/x1.ts", "x/x2.ts", "x/x3.ts", "x/x4.ts", "y/y1.ts", "y/y2.ts", "z/z1.ts"],
      [
        // x1: dependents 1 (x2) + 0.25 (x3, type-only) against 1.25 in y → tie, contested.
        { source: "x/x2.ts", target: "x/x1.ts" },
        { source: "x/x3.ts", target: "x/x1.ts", typeOnly: true },
        { source: "y/y1.ts", target: "x/x1.ts" },
        { source: "y/y2.ts", target: "x/x1.ts", typeOnly: true },
        // x2: no dependents; dependencies x1 (1) and z1 (1) → tie, contested.
        { source: "x/x2.ts", target: "z/z1.ts" },
        // x3: no dependents; dependencies x1 only (0.25) → margin 1.
        // x4: no arcs at all → no evidence.
      ],
      {
        units: [
          {
            anchor: { directory: "x" },
            kind: "feature",
            members: ["x/x1.ts", "x/x2.ts", "x/x3.ts", "x/x4.ts"],
          },
          { anchor: { directory: "y" }, kind: "feature", members: ["y/y1.ts", "y/y2.ts"] },
          { anchor: { directory: "z" }, kind: "feature", members: ["z/z1.ts"] },
        ],
      },
      0.25,
    );
    const x = signals.get("x");
    expect(x?.membersWithEvidence).toBe(3);
    expect(x?.membershipMargin).toBe(1 / 3);
    const nodes = clustering.scope.graph.nodes;
    expect(x?.contested.map((node) => nodes[node])).toEqual(["file:x/x1.ts", "file:x/x2.ts"]);
    // y1 and y2 only have dependencies, all in x: margin 0, contested.
    expect(signals.get("y")).toMatchObject({ membershipMargin: 0, membersWithEvidence: 2 });
    // z1's dependent lies in x: contested.
    expect(signals.get("z")?.contested).toHaveLength(1);
  });

  it("computes prior agreement, moved files and prior components", () => {
    const { signals, clustering } = scenario(
      ["p/a.ts", "p/b.ts", "p/c.ts", "q/d.ts", "q/e.ts"],
      [
        { source: "p/a.ts", target: "p/b.ts" },
        { source: "q/d.ts", target: "q/e.ts" },
      ],
      {
        units: [
          {
            anchor: { directory: "p" },
            kind: "feature",
            members: ["p/a.ts", "p/b.ts", "q/d.ts"],
            prior: ["p/a.ts", "p/b.ts", "p/c.ts"],
          },
          {
            anchor: { directory: "q" },
            kind: "feature",
            members: ["p/c.ts", "q/e.ts"],
            prior: ["q/d.ts", "q/e.ts"],
          },
        ],
      },
    );
    const nodes = clustering.scope.graph.nodes;
    const p = signals.get("p");
    expect(p).toMatchObject({ retained: 2, union: 4, priorAgreement: 0.5, priorComponents: 2 });
    expect(p?.movedIn.map((node) => nodes[node])).toEqual(["file:q/d.ts"]);
    expect(p?.movedOut.map((node) => nodes[node])).toEqual(["file:p/c.ts"]);
    expect(signals.get("q")).toMatchObject({ retained: 1, union: 3, priorComponents: 1 });
  });

  it("counts utilities but not composition roots as users of shared files (D-46)", () => {
    const { signals, clustering } = scenario(
      ["s/s1.ts", "s/s2.ts", "s/s3.ts", "a/a.ts", "b/b.ts", "u/u.ts", "main.ts"],
      [
        { source: "a/a.ts", target: "s/s1.ts" },
        { source: "u/u.ts", target: "s/s1.ts" },
        { source: "main.ts", target: "s/s2.ts" },
        { source: "b/b.ts", target: "s/s2.ts" },
        { source: "s/s1.ts", target: "s/s3.ts" },
      ],
      {
        units: [
          {
            anchor: { directory: "s" },
            kind: "shared",
            members: ["s/s1.ts", "s/s2.ts", "s/s3.ts"],
          },
          { anchor: { directory: "a" }, kind: "feature", members: ["a/a.ts"] },
          { anchor: { directory: "b" }, kind: "feature", members: ["b/b.ts"] },
          { anchor: { directory: "u" }, kind: "shared", members: ["u/u.ts"] },
          { anchor: { directory: "" }, kind: "root", members: ["main.ts"] },
        ],
        orchestrators: { "main.ts": [1, 2] },
        utilities: { "u/u.ts": 2 },
        facades: ["main.ts"],
      },
    );
    const nodes = clustering.scope.graph.nodes;
    const shared = signals.get("s");
    expect(shared?.sharedFiles.map((node) => nodes[node])).toEqual(["file:s/s1.ts"]);
    expect(shared?.sharedUsage).toBe(1 / 3);
    expect(
      shared?.singleUsers.map(({ node, unit }) => [nodes[node], clustering.units[unit]?.key]),
    ).toEqual([["file:s/s2.ts", "b"]]);
    // main.ts is a composition root and a barrel: one wiring member.
    expect(signals.get(".")).toMatchObject({ wiringShare: 1 });
    expect(signals.get(".")?.wiringFiles).toHaveLength(1);
  });

  it("equals a naive recomputation from the definitions (property)", () => {
    const paths = Array.from({ length: 9 }, (_, index) => `d${index % 3}/f${index}.ts`);
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            source: fc.nat(paths.length - 1),
            target: fc.nat(paths.length - 1),
            typeOnly: fc.boolean(),
          }),
          { maxLength: 30 },
        ),
        fc.array(fc.nat(3), { minLength: paths.length, maxLength: paths.length }),
        fc.array(fc.nat(4), { minLength: paths.length, maxLength: paths.length }),
        fc.array(fc.nat(7), { minLength: paths.length, maxLength: paths.length }),
        fc.constantFrom(0, 0.25, 0.5, 1, 3 / 1024),
        (randomEdges, units, priors, classBits, typeOnlyWeight) => {
          const edges = randomEdges
            .filter((edge) => edge.source !== edge.target)
            .map((edge) => ({
              source: paths[edge.source] ?? "",
              target: paths[edge.target] ?? "",
              typeOnly: edge.typeOnly,
            }));
          const model = syntheticModel({
            files: paths,
            edges,
            entryPoints: paths.filter((_, index) => ((classBits[index] ?? 0) & 4) !== 0),
          });
          const settings = resolveInferenceSettings({
            modules: { type_only_weight: typeOnlyWeight },
          });
          const [scope] = moduleScopes({
            model,
            settings,
            projection: METRICS_PROJECTION,
            declaredFiles: new Set(),
          }).scopes;
          if (scope === undefined) throw new Error("no scope");
          const clustering = randomClustering(scope.graph.nodes, units, priors, classBits);
          const actual = moduleSignals({ ...clustering, scope }, entryPointFiles(model));
          expect(actual).toEqual(naiveSignals({ ...clustering, scope }, entryPointFiles(model)));
          for (const signals of actual) {
            for (const signal of [
              "internal-edge-ratio",
              "membership-margin",
              "prior-agreement",
              "module-size",
              "shared-usage",
              "wiring-share",
            ] as const satisfies readonly ModuleSignal[]) {
              const value = signalValue(signals, signal);
              if (value === undefined) continue;
              expect(value).toBeGreaterThanOrEqual(0);
              expect(value).toBeLessThanOrEqual(1);
            }
          }
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
  });
});

/**
 * A clustering of the scope's nodes: unit `units[i]` (empty units dropped), prior `priors[i]` (4 = a dropped
 * unit), classes from bits (1 composition root, 2 utility; 4 marks entry points elsewhere; facades for 3).
 */
function randomClustering(
  nodes: readonly FileId[],
  units: readonly number[],
  priors: readonly number[],
  classBits: readonly number[],
): Omit<ScopeClustering, "scope"> {
  const used = [...new Set(units)].sort((a, b) => a - b);
  const indexOf = new Map(used.map((unit, index) => [unit, index] as const));
  const clusterUnits: ClusterUnit[] = used.map((label) => {
    const members = nodes.map((_, node) => node).filter((node) => units[node] === label);
    const prior = nodes.map((_, node) => node).filter((node) => priors[node] === label);
    return {
      key: inferredModuleKey({ directory: `u${label}` }),
      anchor: { directory: `u${label}` },
      kind: "feature",
      name: `u${label}`,
      members: Int32Array.from(members),
      prior: Int32Array.from(prior),
      destination: true,
    };
  });
  const n = nodes.length;
  const bits = (mask: number): Uint8Array =>
    Uint8Array.from(nodes.map((_, node) => (((classBits[node] ?? 0) & mask) !== 0 ? 1 : 0)));
  return {
    sourceRoot: "",
    units: clusterUnits,
    unitOf: Int32Array.from(nodes.map((_, node) => indexOf.get(units[node] ?? -1) ?? -1)),
    classes: {
      orchestrators: bits(1),
      orchestratorRule: bits(1),
      dependencyUnits: new Int32Array(n),
      utilities: bits(2),
      dependentUnits: new Int32Array(n),
      facades: Uint8Array.from(nodes.map((_, node) => ((classBits[node] ?? 0) === 3 ? 1 : 0))),
    },
    groups: [],
    relocations: [],
    passes: 1,
    converged: true,
  };
}

/** The P9 measurements straight from their definitions (plan 4.4 P9, D-45–D-47), with plain collections. */
function naiveSignals(
  clustering: ScopeClustering,
  entryPoints: ReadonlySet<FileId>,
): UnitSignals[] {
  const { graph } = clustering.scope.graph;
  const arcs = [...graph.edges()];
  const { orchestrators, utilities, facades } = clustering.classes;
  const excluded = (node: number): boolean => orchestrators[node] === 1 || utilities[node] === 1;
  const unitOf = (node: number): number => clustering.unitOf[node] ?? -1;
  return clustering.units.map((unit, index): UnitSignals => {
    const members = [...unit.members];
    const memberSet = new Set(members);
    let internal = 0;
    let cut = 0;
    for (const [u, v, w] of arcs) {
      if (excluded(u) || excluded(v)) continue;
      if (memberSet.has(u) && memberSet.has(v)) internal += w;
      else if (memberSet.has(u) || memberSet.has(v)) cut += w;
    }
    let marginSum = 0;
    let evidence = 0;
    const contested: number[] = [];
    for (const member of members) {
      if (excluded(member)) continue;
      const weigh = (incoming: boolean): Map<number, number> => {
        const weights = new Map<number, number>();
        for (const [u, v, w] of arcs) {
          const other = incoming ? u : v;
          if ((incoming ? v : u) !== member || excluded(other)) continue;
          weights.set(unitOf(other), (weights.get(unitOf(other)) ?? 0) + w);
        }
        return weights;
      };
      let weights = weigh(true);
      if (weights.size === 0) weights = weigh(false);
      const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
      if (total === 0) continue;
      const own = weights.get(index) ?? 0;
      const best = Math.max(0, ...[...weights].filter(([u]) => u !== index).map(([, w]) => w));
      evidence++;
      if (own > best) marginSum += (own - best) / total;
      else contested.push(member);
    }
    const prior = new Set(unit.prior);
    const movedIn = members.filter((node) => !prior.has(node));
    const movedOut = [...unit.prior].filter((node) => !memberSet.has(node));
    const retained = members.length - movedIn.length;
    const union = retained + movedIn.length + movedOut.length;
    const sharedFiles: number[] = [];
    const singleUsers: { node: number; unit: number }[] = [];
    for (const member of members) {
      const users = new Set<number>();
      for (const [u, v] of arcs) {
        if (v === member && orchestrators[u] !== 1 && unitOf(u) !== index) users.add(unitOf(u));
      }
      if (users.size >= 2) sharedFiles.push(member);
      else if (users.size === 1) singleUsers.push({ node: member, unit: [...users][0] ?? -1 });
    }
    const wiringFiles = members.filter(
      (node) =>
        orchestrators[node] === 1 ||
        facades[node] === 1 ||
        entryPoints.has(clustering.scope.graph.nodes[node] ?? "file:?"),
    );
    // Components of the prior members over arcs between them (breadth-first).
    let components = 0;
    const seen = new Set<number>();
    for (const start of unit.prior) {
      if (seen.has(start)) continue;
      components++;
      const queue = [start];
      seen.add(start);
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const [u, v] of arcs) {
          const other = u === next ? v : v === next ? u : -1;
          if (other === -1 || !prior.has(other) || seen.has(other)) continue;
          seen.add(other);
          queue.push(other);
        }
      }
    }
    const files = members.length;
    return {
      files,
      internalWeight: internal,
      cutWeight: cut,
      internalEdgeRatio: 2 * internal + cut > 0 ? (2 * internal) / (2 * internal + cut) : undefined,
      membersWithEvidence: evidence,
      membershipMargin: evidence > 0 ? marginSum / evidence : undefined,
      contested,
      retained,
      union,
      priorAgreement: union === 0 ? 1 : retained / union,
      movedIn,
      movedOut,
      moduleSize: files / (files + 2),
      sharedFiles,
      sharedUsage: files === 0 ? 0 : sharedFiles.length / files,
      singleUsers,
      wiringFiles,
      wiringShare: files === 0 ? 0 : wiringFiles.length / files,
      priorComponents: components,
    };
  });
}
