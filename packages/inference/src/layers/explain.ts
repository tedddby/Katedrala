/**
 * Layer confidence, evidence and reasons (§4.5, §5.3; plan 4.5 and 4.6; docs/ALGORITHMS.md, "Layers" and
 * "Evidence and explanation") [KATEDRALA HEURISTIC].
 *
 * The confidence of an inferred layer is the weighted sum of four measurements (§4.5):
 *
 * | Signal | Weight | Measures |
 * | --- | --- | --- |
 * | `label-agreement` | 0.35 | the mean winning label score of the members |
 * | `direction-consistency` | 0.35 | the share of the layer's cross-layer dependency weight that follows the inferred order |
 * | `order-support` | 0.20 | the share of the other layers that observed dependency paths order relative to the layer |
 * | `layer-size` | 0.10 | `n / (n + 2)` for n members |
 *
 * A signal that cannot be computed is listed without a value and contributes 0 (D-45, D-54; the prototype
 * renormalized the weights instead). The context signals `role-sources`, `upward-dependencies`,
 * `conventional-order` and `misplaced-by-name` explain the layer without entering its confidence, and the
 * reason summarizes the layer in one sentence that begins with "Inferred:" (D-66).
 *
 * Determinism: layers are numbered in name order, members in id order, and every sum runs in index order
 * over exact lattice weights (D-67); descriptions format published values with `toFixed` (D-58), never with
 * locale-dependent formatting.
 */
import { baseName, compareStrings, layerId } from "@katedrala/ir";
import type { FileId, InferenceInfo } from "@katedrala/ir";
import { formatList, formatNumber, formatPercent, inferenceInfo } from "../evidence.js";
import { nameParts, sStem, tokenize } from "../lexical.js";
import type { ContextSignal, FileLabel, Vocabulary, VoteSource, WeightedSignal } from "../types.js";
import type { LayerGraph, LayerOrder } from "./order.js";
import type { LayerPartition } from "./partition.js";

/**
 * The weights of the layer signals [KATEDRALA HEURISTIC] (§4.5): constants of the layer method
 * (`katedrala/layer-inference@1`), not configuration (Q-10). They sum to 1.
 */
export const LAYER_SIGNAL_WEIGHTS: Readonly<{
  "label-agreement": number;
  "direction-consistency": number;
  "order-support": number;
  "layer-size": number;
}> = Object.freeze({
  "label-agreement": 0.35,
  "direction-consistency": 0.35,
  "order-support": 0.2,
  "layer-size": 0.1,
});

/**
 * The measurements behind the weighted signals of one layer [KATEDRALA HEURISTIC] (§4.5), before evidence
 * assembly: exact sums of lattice weights (D-67) and the quotients computed from them once.
 */
export interface LayerMeasurement {
  /** Member files. */
  readonly files: number;
  /** Mean winning label score of the members (`label-agreement`). */
  readonly labelAgreement: number;
  /** Weight of the observed layer dependencies the layer takes part in, either direction. */
  readonly incidentWeight: number;
  /** The part of `incidentWeight` that follows the inferred order. */
  readonly followingWeight: number;
  /** `followingWeight / incidentWeight`; undefined without incident weight (D-45). */
  readonly directionConsistency: number | undefined;
  /** Other layers that observed, kept dependency paths order relative to this one. */
  readonly comparableLayers: number;
  /** Number of other layers. */
  readonly otherLayers: number;
  /** `comparableLayers / otherLayers` (`order-support`); 0 without other layers. */
  readonly orderSupport: number;
  /** `n / (n + 2)` (`layer-size`). */
  readonly layerSize: number;
}

/**
 * Every layer each layer reaches over the kept observed arcs of H (no removed arc, no conventional arc), as a
 * `count × count` matrix of 0/1 (`reach[a · count + b]`); each layer reaches itself.
 */
function observedReach(graph: LayerGraph, order: LayerOrder): Uint8Array {
  const h = graph.graph;
  const count = h.nodeCount;
  const reach = new Uint8Array(count * count);
  const queue = new Int32Array(count);
  for (let source = 0; source < count; source++) {
    const row = source * count;
    reach[row + source] = 1;
    queue[0] = source;
    let size = 1;
    for (let head = 0; head < size; head++) {
      const layer = queue[head]!;
      for (let e = h.outOffsets[layer]!; e < h.outOffsets[layer + 1]!; e++) {
        if (order.isRemoved[e] === 1) continue;
        const target = h.outTargets[e]!;
        if (reach[row + target] === 1) continue;
        reach[row + target] = 1;
        queue[size++] = target;
      }
    }
  }
  return reach;
}

/**
 * Measure the weighted signals of every layer [KATEDRALA HEURISTIC] (§4.5, plan 4.5). The result is
 * parallel to `partition.layers`.
 *
 * - `label-agreement`: the mean `FileLabel.score` of the members (the score of their winning label).
 * - `direction-consistency`: over the arcs of H incident to the layer, the share of their weight that follows
 *   the order: an arc `a → b` follows when it was not removed and `rank(a) < rank(b)`, so outgoing arcs to a
 *   higher rank and incoming arcs from a lower rank follow, while equal ranks and upward dependencies do not.
 *   Undefined when no arc is incident (D-45).
 * - `order-support`: the share of the other layers comparable with the layer through observed paths, i.e.
 *   one reaches the other over kept arcs of H; conventional arcs do not count (BFS over the layers).
 * - `layer-size`: `n / (n + 2)`.
 *
 * Weights are summed in arc order and are exact (D-67); the quotients are computed once from exact sums.
 *
 * Complexity: O(F + L · (L + E_H)) for F member files, L layers and E_H arcs. Determinism: index order.
 */
export function measureLayers(
  partition: LayerPartition,
  graph: LayerGraph,
  order: LayerOrder,
  labels: ReadonlyMap<FileId, FileLabel>,
): LayerMeasurement[] {
  const h = graph.graph;
  const count = partition.layers.length;
  const incident = new Float64Array(count);
  const following = new Float64Array(count);
  for (let a = 0; a < count; a++) {
    for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
      const b = h.outTargets[e]!;
      const weight = h.outWeights[e]!;
      incident[a]! += weight;
      incident[b]! += weight;
      if (order.isRemoved[e] === 0 && order.ranks[a]! < order.ranks[b]!) {
        following[a]! += weight;
        following[b]! += weight;
      }
    }
  }
  const reach = observedReach(graph, order);
  return partition.members.map((members, layer): LayerMeasurement => {
    let scores = 0;
    for (const file of members) scores += labels.get(file)?.score ?? 0;
    let comparable = 0;
    for (let other = 0; other < count; other++) {
      if (other === layer) continue;
      if (reach[layer * count + other] === 1 || reach[other * count + layer] === 1) comparable++;
    }
    const files = members.length;
    const otherLayers = count - 1;
    const incidentWeight = incident[layer]!;
    return {
      files,
      labelAgreement: files === 0 ? 0 : scores / files,
      incidentWeight,
      followingWeight: following[layer]!,
      directionConsistency: incidentWeight > 0 ? following[layer]! / incidentWeight : undefined,
      comparableLayers: comparable,
      otherLayers,
      orderSupport: otherLayers > 0 ? comparable / otherLayers : 0,
      layerSize: files / (files + 2),
    };
  });
}

// ─── Text helpers ─────────────────────────────────────────────────────────────────────────────────────

/** `1 file`, `3 files`. */
function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** A name in backticks. */
function quoted(name: string): string {
  return `\`${name}\``;
}

/** The path of a file id (`file:<path>`). */
function pathOf(file: FileId): string {
  return file.slice("file:".length);
}

/**
 * Items as an English list of at most `limit` entries (`limits.maxEvidenceEntities`), the rest counted:
 * "`a`, `b` and 3 more". With a limit of 0 only the count is given.
 */
function boundedList(items: readonly string[], limit: number, noun: string): string {
  if (items.length <= limit) return formatList(items);
  const shown = items.slice(0, Math.max(0, limit));
  if (shown.length === 0) return counted(items.length, noun);
  return formatList([...shown, `${items.length - shown.length} more`]);
}

/** The most frequent value (ties: the smallest by `compareStrings`) and how often it occurs. */
function dominant(
  values: readonly string[],
): { readonly value: string; readonly count: number } | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: string; count: number } | undefined;
  for (const value of [...counts.keys()].sort(compareStrings)) {
    const count = counts.get(value) ?? 0;
    if (best === undefined || count > best.count) best = { value, count };
  }
  return best;
}

/**
 * A separator of name tokens: neither an ASCII letter, an ASCII digit nor a non-ASCII character (D-05), as in
 * `tokenize`. Without the `u` flag the class matches UTF-16 code units.
 */
const SEPARATOR = /^[^A-Za-z0-9\u0080-\uFFFF]$/;

/**
 * The file-name pattern of a member's naming vote for `layer` (for the reason): the matched qualifier and
 * what follows it (`payment.controller.ts` → `*.controller.ts`), else the matched last word of the head with
 * its separator (`payment-service.ts` → `*-service.ts`, `PaymentService.ts` → `*Service.ts`). Undefined when
 * no file-name vote names the layer (a class-name, configuration, detector or location vote).
 */
function fileNamePattern(
  file: FileId,
  label: FileLabel | undefined,
  layer: string,
  vocabulary: Vocabulary,
): string | undefined {
  const signals = new Set(
    (label?.votes ?? [])
      .filter((vote) => vote.source === "naming" && vote.label === layer)
      .map((vote) => vote.signal),
  );
  const name = baseName(pathOf(file));
  const { head, qualifiers } = nameParts(name);
  if (signals.has("name-qualifier")) {
    // D-15: the last qualifier the naming vocabulary knows is the one that voted.
    for (let index = qualifiers.length - 1; index >= 0; index--) {
      if (vocabulary.namingSuffixes.has(sStem(qualifiers[index] ?? ""))) {
        return `*.${name
          .split(".")
          .slice(index + 1)
          .join(".")}`;
      }
    }
  }
  if (signals.has("name-suffix")) {
    const words = tokenize(head);
    const last = words[words.length - 1];
    if (last !== undefined) {
      const start = head.lastIndexOf(last.text);
      const from = start > 0 && SEPARATOR.test(head.charAt(start - 1)) ? start - 1 : start;
      return `*${head.slice(from)}${name.slice(head.length)}`;
    }
  }
  return undefined;
}

/** Everything the descriptions and the reason of one layer read. */
interface LayerContext {
  readonly name: string;
  readonly members: readonly FileId[];
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  readonly vocabulary: Vocabulary;
  readonly maxEntities: number;
}

/**
 * The subject of the reason: the dominant location directory (the most frequent among the members' location
 * votes for the layer; ties go to the smallest path), else the dominant file-name pattern, else the vote
 * sources that place the members (plan 4.6).
 */
function reasonSubject(context: LayerContext): string {
  const { name, members, labels, vocabulary } = context;
  const n = members.length;
  const located = members.filter((file) => labels.get(file)?.location?.label === name);
  const directory = dominant(located.map((file) => labels.get(file)?.location?.directory ?? ""));
  if (directory !== undefined) {
    if (directory.count < n) {
      return `${quoted(directory.value)} holds ${directory.count} of the layer's ${counted(n, "file")}`;
    }
    const patterns = members.flatMap(
      (file) => fileNamePattern(file, labels.get(file), name, vocabulary) ?? [],
    );
    const pattern = dominant(patterns);
    const files = `${quoted(directory.value)} holds ${counted(n, "file")}`;
    if (pattern === undefined) return files;
    if (pattern.count === n) return `${files} named ${quoted(pattern.value)}`;
    return `${files}, ${pattern.count} of them named ${quoted(pattern.value)}`;
  }
  const patterns = members.flatMap(
    (file) => fileNamePattern(file, labels.get(file), name, vocabulary) ?? [],
  );
  const pattern = dominant(patterns);
  if (pattern !== undefined) {
    const verb = pattern.count === 1 ? "is" : "are";
    if (pattern.count === n) return `${counted(n, "file")} ${verb} named ${quoted(pattern.value)}`;
    return `${pattern.count} of the layer's ${counted(n, "file")} ${verb} named ${quoted(pattern.value)}`;
  }
  const sources = new Set<VoteSource>();
  for (const file of members) {
    for (const vote of labels.get(file)?.votes ?? [])
      if (vote.label === name) sources.add(vote.source);
  }
  const verb = n === 1 ? "is" : "are";
  // A label always comes with a vote for it; the fallback only keeps hand-made inputs readable.
  if (sources.size === 0) return `${counted(n, "file")} ${verb} in this layer`;
  return `${counted(n, "file")} ${verb} assigned to this layer by ${formatList([...sources].sort(compareStrings))}`;
}

/** "no other layer depends on it" / "`controller` depends on it" / "`a` and `b` depend on it". */
function dependentsPhrase(names: readonly string[], maxEntities: number): string {
  if (names.length === 0) return "no other layer depends on it";
  const list = boundedList(names.map(quoted), maxEntities, "layer");
  return `${list} ${names.length === 1 ? "depends" : "depend"} on it`;
}

/** "it depends on no other layer" / "it depends on `model` and `repository`". */
function dependenciesPhrase(names: readonly string[], maxEntities: number): string {
  if (names.length === 0) return "it depends on no other layer";
  return `it depends on ${boundedList(names.map(quoted), maxEntities, "layer")}`;
}

/**
 * The reason of a layer (plan 4.6, D-66): "Inferred: `src/controllers` holds 3 files named
 * `*.controller.ts`; no other layer depends on it and it depends on `service` (rank 0)." The relations are the
 * observed layer dependencies (arcs of H, upward ones included); conventional arcs are not dependencies.
 */
function layerReason(
  context: LayerContext,
  rank: number,
  dependents: readonly string[],
  dependencies: readonly string[],
): string {
  const relations =
    dependents.length === 0 && dependencies.length === 0
      ? "no dependency connects it with another layer"
      : `${dependentsPhrase(dependents, context.maxEntities)} and ` +
        dependenciesPhrase(dependencies, context.maxEntities);
  return `Inferred: ${reasonSubject(context)}; ${relations} (rank ${rank}).`;
}

// ─── Signals ──────────────────────────────────────────────────────────────────────────────────────────

/** The four weighted signals of a layer (§4.5), with factual descriptions of what was measured (D-66). */
function weightedSignals(measurement: LayerMeasurement): WeightedSignal[] {
  const n = measurement.files;
  const direction = measurement.directionConsistency;
  return [
    {
      signal: "label-agreement",
      weight: LAYER_SIGNAL_WEIGHTS["label-agreement"],
      value: measurement.labelAgreement,
      description:
        `The members' votes for this layer score ${formatNumber(measurement.labelAgreement, 2)} on ` +
        "average (maximum within a vote source, noisy-OR across sources).",
    },
    direction === undefined
      ? {
          signal: "direction-consistency",
          weight: LAYER_SIGNAL_WEIGHTS["direction-consistency"],
          // D-45, D-54: listed without a value; it contributes 0.
          description:
            "No dependency connects this layer with another layer, so the direction of its dependencies " +
            "cannot be measured.",
        }
      : {
          signal: "direction-consistency",
          weight: LAYER_SIGNAL_WEIGHTS["direction-consistency"],
          value: direction,
          description:
            `${formatPercent(direction)} of the dependency weight between this layer and other layers ` +
            "follows the inferred order, outgoing to a higher rank or incoming from a lower rank " +
            `(${formatNumber(measurement.followingWeight, 1)} of ${formatNumber(measurement.incidentWeight, 1)}).`,
        },
    {
      signal: "order-support",
      weight: LAYER_SIGNAL_WEIGHTS["order-support"],
      value: measurement.orderSupport,
      description:
        `Observed dependency paths order this layer relative to ${measurement.comparableLayers} of ` +
        `${measurement.otherLayers === 1 ? "the 1 other layer" : `the ${measurement.otherLayers} other layers`} ` +
        "(conventional arcs and upward dependencies do not count).",
    },
    {
      signal: "layer-size",
      weight: LAYER_SIGNAL_WEIGHTS["layer-size"],
      value: measurement.layerSize,
      description: `The layer has ${counted(n, "member file")}.`,
    },
  ];
}

/**
 * `role-sources`: how many members each combination of vote sources places in the layer, largest group
 * first: "3 members by location and naming, 1 by location only."
 */
function roleSources(context: LayerContext): ContextSignal {
  const groups = new Map<string, number>();
  for (const file of context.members) {
    const sources = new Set<VoteSource>();
    for (const vote of context.labels.get(file)?.votes ?? []) {
      if (vote.label === context.name) sources.add(vote.source);
    }
    const list = [...sources].sort(compareStrings);
    const key = `${formatList(list)}${list.length === 1 ? " only" : ""}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const ordered = [...groups].sort(([a, x], [b, y]) => y - x || compareStrings(a, b));
  const parts = ordered.map(
    ([sources, count], index) =>
      `${index === 0 ? counted(count, "member") : String(count)} by ${sources}`,
  );
  return { signal: "role-sources", description: `${parts.join(", ")}.` };
}

/**
 * `misplaced-by-name`: members whose strongest naming vote (ties: the smaller label) names another layer
 * than their location vote. One entry per layer; value and entities are those members.
 */
function misplacedByName(context: LayerContext): ContextSignal | undefined {
  const misplaced: { readonly file: FileId; readonly named: string; readonly located: string }[] =
    [];
  for (const file of context.members) {
    const label = context.labels.get(file);
    const located = label?.location?.label;
    if (label === undefined || located === undefined) continue;
    let named: { label: string; confidence: number } | undefined;
    for (const vote of label.votes) {
      if (vote.source !== "naming" || vote.label === null) continue;
      if (
        named === undefined ||
        vote.confidence > named.confidence ||
        (vote.confidence === named.confidence && compareStrings(vote.label, named.label) < 0)
      ) {
        named = { label: vote.label, confidence: vote.confidence };
      }
    }
    if (named !== undefined && named.label !== located) {
      misplaced.push({ file, named: named.label, located });
    }
  }
  if (misplaced.length === 0) return undefined;
  const k = misplaced.length;
  const clauses = misplaced.map(
    ({ file, named, located }) =>
      `${quoted(pathOf(file))} (name: ${quoted(named)}, directory: ${quoted(located)})`,
  );
  return {
    signal: "misplaced-by-name",
    value: k,
    entities: misplaced.map(({ file }) => file),
    description:
      `${counted(k, "member")} ${k === 1 ? "is" : "are"} named for another layer than ` +
      `${k === 1 ? "its" : "their"} directory: ${boundedList(clauses, context.maxEntities, "file")}.`,
  };
}

/**
 * `upward-dependencies` (on the depending layer of a removed arc): "2 file dependencies (weight 1.5, of
 * which 0.5 type-only) point from `repository` to `service`, against the inferred order." The type-only
 * share is stated because layer ordering counts type-only references at `type_only_weight` even when the
 * metrics projection, and so `LayerEntity.dependencies`, omits them (D-51).
 */
function upwardDependency(graph: LayerGraph, arc: number, from: string, to: string): ContextSignal {
  const pairs = graph.pairs[arc] ?? 0;
  const weight = graph.graph.outWeights[arc] ?? 0;
  const typeOnly = graph.typeOnlyWeights[arc] ?? 0;
  const share = typeOnly > 0 ? `, of which ${formatNumber(typeOnly, 1)} type-only` : "";
  return {
    signal: "upward-dependencies",
    value: weight,
    entities: graph.dependingFiles[arc] ?? [],
    description:
      `${pairs} file ${pairs === 1 ? "dependency" : "dependencies"} (weight ${formatNumber(weight, 1)}${share}) ` +
      `${pairs === 1 ? "points" : "point"} from ${quoted(from)} to ${quoted(to)}, against the inferred order.`,
  };
}

/** `conventional-order` on both layers of a conventional arc `outer → inner` (D-53, D-66). */
function conventionalOrder(self: string, other: string, after: boolean): ContextSignal {
  return {
    signal: "conventional-order",
    entities: [layerId(self), layerId(other)],
    description:
      `Placed ${after ? "after" : "before"} ${quoted(other)} by the conventional tier order ` +
      "(Katedrala heuristic): no observed dependency path connects them.",
  };
}

/**
 * What {@link explainLayers} reads [KATEDRALA HEURISTIC]: the partition, the layer graph and its order, the
 * per-file labels, the vocabulary (file-name patterns of reasons), the method string and the entity bound.
 */
export interface LayerExplanationInput {
  readonly partition: LayerPartition;
  readonly graph: LayerGraph;
  readonly order: LayerOrder;
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  readonly vocabulary: Vocabulary;
  /** `settings.methods.layers` (D-56). */
  readonly method: string;
  /** `limits.maxEvidenceEntities`. */
  readonly maxEntities: number;
}

/**
 * The `InferenceInfo` of every inferred layer [KATEDRALA HEURISTIC] (§4.5, §5.3, plan 4.6), parallel to
 * `partition.layers`:
 *
 * - weighted: `label-agreement` (0.35), `direction-consistency` (0.35), `order-support` (0.20) and
 *   `layer-size` (0.10), measured by {@link measureLayers}; an absent `direction-consistency` is listed
 *   without a value and contributes 0 (D-45, D-54);
 * - context: `role-sources` (members per combination of vote sources); `upward-dependencies` on the
 *   depending layer of each removed arc (value: its weight; entities: the depending files; the type-only
 *   share, D-51); `conventional-order` on both layers of each conventional arc (entities: the two layer
 *   ids; worded as a Katedrala heuristic, D-66); `misplaced-by-name` (members whose name points to another
 *   layer than their directory);
 * - the reason (D-66): "Inferred: `src/controllers` holds 3 files named `*.controller.ts`; no other layer
 *   depends on it and it depends on `service` (rank 0)." It is built from the dominant location directory
 *   (ties: the smallest path), else the dominant file-name pattern, else the vote sources, then the layers
 *   that depend on this one and those it depends on (observed arcs of H) and the rank.
 *
 * `inferenceInfo` computes the confidence, orders the evidence and bounds every entity list by
 * `maxEntities`; descriptions bound their own lists the same way.
 *
 * Complexity: O(F · V + L · (L + E_H) + Σ evidence) for F members with V votes each. Determinism: index
 * order, sorted name lists, exact sums (D-67), `toFixed` formatting (D-58).
 */
export function explainLayers(input: LayerExplanationInput): InferenceInfo[] {
  const { partition, graph, order, labels, vocabulary, method, maxEntities } = input;
  const measurements = measureLayers(partition, graph, order, labels);
  const names = partition.layers;
  const h = graph.graph;
  const dependents: string[][] = names.map(() => []);
  const dependencies: string[][] = names.map(() => []);
  const context: ContextSignal[][] = names.map(() => []);
  for (let a = 0; a < names.length; a++) {
    for (let e = h.outOffsets[a]!; e < h.outOffsets[a + 1]!; e++) {
      const b = h.outTargets[e]!;
      // Targets ascend within a row and rows ascend, so both lists come out in name order.
      dependencies[a]!.push(names[b]!);
      dependents[b]!.push(names[a]!);
      if (order.isRemoved[e] === 1)
        context[a]!.push(upwardDependency(graph, e, names[a]!, names[b]!));
    }
  }
  for (const [outer, inner] of order.conventional) {
    context[outer]!.push(conventionalOrder(names[outer]!, names[inner]!, false));
    context[inner]!.push(conventionalOrder(names[inner]!, names[outer]!, true));
  }
  return names.map((name, layer) => {
    const layerContext: LayerContext = {
      name,
      members: partition.members[layer] ?? [],
      labels,
      vocabulary,
      maxEntities,
    };
    const signals = [...context[layer]!, roleSources(layerContext)];
    const misplaced = misplacedByName(layerContext);
    if (misplaced !== undefined) signals.push(misplaced);
    return inferenceInfo({
      method,
      reason: layerReason(
        layerContext,
        order.ranks[layer]!,
        dependents[layer]!,
        dependencies[layer]!,
      ),
      weighted: weightedSignals(measurements[layer]!),
      context: signals,
      maxEntities,
    });
  });
}
