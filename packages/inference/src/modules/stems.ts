/**
 * P2 of module inference: organization style and stem units (§3.6; docs/ALGORITHMS.md, "Modules", P2).
 *
 * In a layer-organized source tree (`controllers/`, `services/`, `repositories/`, ...) a feature is spread
 * across the layer directories and recognizable by a recurring file-name stem (`payment.controller.ts`,
 * `payment.service.ts`, `models/payment.ts`) or a recurring sub-directory (`controllers/payment/`,
 * `services/payment/`). P2 classifies the children of every directory P1 split, and where at least two are
 * layer directories it forms stem units from the stems that recur across layer directories *and* whose
 * files are connected by dependencies: names alone do not make a module (Anquetil & Lethbridge 1999; Kuhn,
 * Ducasse & Gîrba 2007, cited in §3.1, support stems as a prior used together with dependencies).
 *
 * Determinism: groups are processed in `compareStrings` order of their directories, stems in
 * `compareStrings` order, nodes ascending; union-find roots are the smallest node of each component.
 */
import { baseName, compareStrings, inferredModuleKey } from "@katedrala/ir";
import { directoryKind } from "../directories.js";
import { fileStem, sStem } from "../lexical.js";
import type { GroupOrganization, InferenceSettings, OrganizationStyle, Scope } from "../types.js";
import { addUnit } from "./prior.js";
import type { PriorUnits } from "./prior.js";

/**
 * Characters a module stem never contains (plan 3.5 item 1). File-name tokens cannot contain them (D-05);
 * a recurring sub-directory whose stemmed name contains one gives no sub-directory stem (D-28, as amended
 * by U1: `inferredModuleKey` rejects such stems).
 */
const STEM_FORBIDDEN = /[%#~/]/;

/**
 * One kept component of a recurring stem [KATEDRALA HEURISTIC] (§3.6, D-27): a connected component of the
 * undirected arcs among the stem's files below layer children, spanning at least two layer children.
 */
export interface StemComponent {
  readonly stem: string;
  /** Nodes, ascending. */
  readonly nodes: readonly number[];
}

/** What P2 found in one split directory [KATEDRALA HEURISTIC] (§3.6). */
export interface StemGroup {
  readonly organization: GroupOrganization;
  /**
   * The kept components (D-27), by stem and then by smallest node, whether or not the stems were applied.
   * Exposed for the structure property of plan 7.1 and for tests.
   */
  readonly components: readonly StemComponent[];
}

/** The result of P2 for one scope [KATEDRALA HEURISTIC] (§3.6). */
export interface StemUnits {
  /** One group per directory P1 split, sorted by directory. */
  readonly groups: readonly StemGroup[];
  /** Per node: the stem whose unit (or feature child) an applied group moved it to; else undefined. */
  readonly stemOf: readonly (string | undefined)[];
  /**
   * Per node with a `stemOf`: the original spelling the stem came from: the first token of the file name,
   * or the sub-directory name for a sub-directory stem (D-28). Stem units are named by it (P6).
   */
  readonly originalOf: readonly (string | undefined)[];
  /** Per group directory whose stems were applied: those stems, sorted (the taken set of P4 keys, D-34). */
  readonly appliedStems: ReadonlyMap<string, readonly string[]>;
}

/**
 * The organization style of a split directory [KATEDRALA HEURISTIC] (§3.6, D-26): `layer` with at least two
 * layer children (`mixed` when it also has a feature child), `feature` with at most one layer child and at
 * least one feature child, and `none` otherwise (the case §3.6's table leaves open, e.g. one layer child and
 * a shared child, as in simple-dependencies).
 *
 * Complexity: O(1).
 */
export function organizationStyle(
  layerChildren: number,
  featureChildren: number,
): OrganizationStyle {
  if (layerChildren >= 2) return featureChildren >= 1 ? "mixed" : "layer";
  return featureChildren >= 1 ? "feature" : "none";
}

/** Union-find root with path halving. */
function find(parent: Int32Array, node: number): number {
  let current = node;
  while (parent[current]! !== current) {
    parent[current] = parent[parent[current]!]!;
    current = parent[current]!;
  }
  return current;
}

/**
 * P2, organization style and stem units [KATEDRALA HEURISTIC] (§3.6). For every directory `d` that P1 split,
 * in path order:
 *
 * 1. Classify the children with nodes into layer, feature and shared children by `directoryKind`; container
 *    children count in none of them (D-26).
 * 2. With at least two layer children, give every node below a layer child `c` a stem: the *sub-directory
 *    stem* when the node lies in `c/s/...`, `sStem(s)` occurs as the stemmed name of a sub-directory directly
 *    below at least two layer children (distinct layer children are counted), is not a generic token and
 *    contains none of `%`, `#`, `~` (D-28; deeper levels are a feature's internal structure); otherwise its
 *    file stem (`fileStem`, D-06, D-09), possibly none.
 * 3. Union-find over the scope graph's arcs whose endpoints share a stem and both lie below layer children
 *    (the undirected view).
 * 4. Keep, per stem, the union of the components that span at least two layer children (D-27: a stem may
 *    keep several components; each is connected, the union need not be). `coverage = kept / below`, the
 *    correctly rounded quotient of the kept nodes and all nodes below layer children (sub-units of a
 *    size-split layer child included), so that 3/10 against 0.3 compares equal (D-67).
 * 5. When at least one stem was kept and `coverage ≥ stemMinCoverage`, apply the stems in stem order: their
 *    files leave their units (members and prior alike) and join the feature child of `d` whose stemmed name
 *    equals the stem, the one with the smallest path when several do (D-70); otherwise a new destination
 *    unit `{ directory: d, stem }` of kind `stem` is created with `group = d`. A feature child without a
 *    unit of its own (split by the size cap, without loose files) gets one, anchored on it.
 * 6. The style is {@link organizationStyle}; the group's counts are recorded in its `GroupOrganization`.
 *
 * Groups are applied in path order, so a group nested below a layer child of another group (a layer
 * directory split by the size cap) may move a node again; its unit is then the inner group's.
 *
 * The connectivity requirement keeps coincidental names apart: in clean-architecture `loan` occurs in three
 * layer directories, but the route file depends on neither domain file, so no `loan` unit is formed (§3.6).
 *
 * Complexity: O(n + m) per group plus tokenization, O(n) memory reused across groups. Determinism: see the
 * module comment.
 */
export function applyStemUnits(
  scope: Scope,
  prior: PriorUnits,
  settings: InferenceSettings,
): StemUnits {
  const { graph } = scope.graph;
  const { paths, tree, partition } = prior;
  const { vocabulary } = settings;
  const { stemMinCoverage } = settings.modules;
  const n = paths.length;
  const unitIndex = new Map<string, number>();
  partition.units.forEach((unit, index) => unitIndex.set(unit.key, index));

  const stemOf: (string | undefined)[] = new Array<string | undefined>(n).fill(undefined);
  const originalOf: (string | undefined)[] = new Array<string | undefined>(n).fill(undefined);
  const appliedStems = new Map<string, readonly string[]>();
  const groups: StemGroup[] = [];

  // Per-node scratch arrays, reset after each group (only the entries a group touched).
  const layerChild = new Int32Array(n).fill(-1);
  const stemId = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n);

  for (const directory of prior.splitDirectories) {
    const layer: string[] = [];
    const feature: string[] = [];
    const shared: string[] = [];
    for (const child of tree.children(directory)) {
      // D-26: container children are counted in none of the three classes.
      const kind = directoryKind(child, vocabulary);
      if (kind === "layer") layer.push(child);
      else if (kind === "feature") feature.push(child);
      else if (kind === "shared") shared.push(child);
    }
    let layerFiles = 0;
    for (const child of layer) layerFiles += tree.subtreeSize(child);
    const base = {
      directory,
      style: organizationStyle(layer.length, feature.length),
      layerChildren: layer,
      featureChildren: feature,
      sharedChildren: shared,
      layerFiles,
    };
    if (layer.length < 2) {
      groups.push({
        organization: { ...base, recurrentStems: [], coveredFiles: 0, stemsApplied: false },
        components: [],
      });
      continue;
    }

    // D-28: stemmed names of the sub-directories directly below each layer child, counted once per child.
    const occurrences = new Map<string, number>();
    for (const child of layer) {
      const seen = new Set<string>();
      for (const sub of tree.children(child)) {
        const key = sStem(baseName(sub));
        if (seen.has(key)) continue;
        seen.add(key);
        occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      }
    }

    // Stems of the nodes below layer children.
    const below: number[] = [];
    const stems: string[] = [];
    const stemIndex = new Map<string, number>();
    const original = new Map<number, string>();
    layer.forEach((child, layerIndex) => {
      for (const node of tree.subtreeFiles(child)) {
        below.push(node);
        layerChild[node] = layerIndex;
        const path = paths[node]!;
        const rest = path.slice(child.length + 1);
        const slash = rest.indexOf("/");
        let stem: string | undefined;
        let spelling: string | undefined;
        if (slash !== -1) {
          // D-28: the first sub-directory level directly below the layer child.
          const sub = rest.slice(0, slash);
          const key = sStem(sub);
          if (
            (occurrences.get(key) ?? 0) >= 2 &&
            !vocabulary.genericTokens.has(key) &&
            !STEM_FORBIDDEN.test(key)
          ) {
            stem = key;
            spelling = sub;
          }
        }
        if (stem === undefined) {
          const token = fileStem(path, vocabulary);
          if (token !== undefined) {
            stem = token.stem;
            spelling = token.original;
          }
        }
        if (stem === undefined || spelling === undefined) continue;
        let id = stemIndex.get(stem);
        if (id === undefined) {
          id = stems.length;
          stems.push(stem);
          stemIndex.set(stem, id);
        }
        stemId[node] = id;
        original.set(node, spelling);
      }
    });
    below.sort((a, b) => a - b);

    // Union-find over same-stem arcs below layer children; the smaller node becomes the root.
    for (const node of below) parent[node] = node;
    for (const node of below) {
      const id = stemId[node]!;
      if (id === -1) continue;
      for (let e = graph.outOffsets[node]!; e < graph.outOffsets[node + 1]!; e++) {
        const target = graph.outTargets[e]!;
        if (layerChild[target]! === -1 || stemId[target]! !== id) continue;
        const a = find(parent, node);
        const b = find(parent, target);
        if (a < b) parent[b] = a;
        else if (b < a) parent[a] = b;
      }
    }
    const componentNodes = new Map<number, number[]>();
    for (const node of below) {
      if (stemId[node]! === -1) continue;
      const root = find(parent, node);
      const nodes = componentNodes.get(root);
      if (nodes === undefined) componentNodes.set(root, [node]);
      else nodes.push(node);
    }

    // D-27: keep, per stem, the union of the components that span at least two layer children.
    const components: StemComponent[] = [];
    const keptByStem = new Map<string, number[]>();
    let covered = 0;
    for (const root of [...componentNodes.keys()].sort((a, b) => a - b)) {
      const nodes = componentNodes.get(root) ?? [];
      const spanned = new Set<number>();
      for (const node of nodes) spanned.add(layerChild[node]!);
      if (spanned.size < 2) continue;
      const stem = stems[stemId[root]!]!;
      components.push({ stem, nodes });
      covered += nodes.length;
      const kept = keptByStem.get(stem);
      if (kept === undefined) keptByStem.set(stem, [...nodes]);
      else kept.push(...nodes);
    }
    components.sort((a, b) => compareStrings(a.stem, b.stem) || a.nodes[0]! - b.nodes[0]!);
    const recurrentStems = [...keptByStem.keys()].sort(compareStrings);
    // D-67: the correctly rounded quotient, compared with the configured threshold.
    const stemsApplied = recurrentStems.length > 0 && covered / layerFiles >= stemMinCoverage;

    if (stemsApplied) {
      for (const stem of recurrentStems) {
        // D-70: the feature child with the smallest path whose stemmed name equals the stem.
        const target = feature.find((child) => sStem(baseName(child)) === stem);
        let unit: number;
        if (target !== undefined) {
          const key = inferredModuleKey({ directory: target });
          const existing = unitIndex.get(key);
          unit = existing ?? addUnit(partition, { directory: target }, "feature");
          if (existing === undefined) unitIndex.set(key, unit);
        } else {
          unit = addUnit(partition, { directory, stem }, "stem", { group: directory });
          unitIndex.set(partition.units[unit]!.key, unit);
        }
        const nodes = (keptByStem.get(stem) ?? []).sort((a, b) => a - b);
        for (const node of nodes) {
          partition.unitOf[node] = unit;
          stemOf[node] = stem;
          originalOf[node] = original.get(node);
        }
      }
      appliedStems.set(directory, recurrentStems);
    }
    groups.push({
      organization: { ...base, recurrentStems, coveredFiles: covered, stemsApplied },
      components,
    });

    for (const node of below) {
      layerChild[node] = -1;
      stemId[node] = -1;
    }
  }
  return { groups, stemOf, originalOf, appliedStems };
}
