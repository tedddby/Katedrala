/**
 * Module evidence and reasons (§3.13, §5.2; plan 4.6, "Module signals"; docs/ALGORITHMS.md, "Evidence and
 * explanation") [KATEDRALA HEURISTIC].
 *
 * Every inferred module carries an `InferenceInfo` assembled by `inferenceInfo` (plan 4.6):
 *
 * - the **weighted signals** of its kind (P9, `MODULE_SIGNAL_WEIGHTS`), each with a factual description of
 *   what was measured; a signal that cannot be computed is listed without a value, contributes 0 and says why
 *   (D-45);
 * - **context signals** that explain without entering the confidence: the kind of the module (D-48), the
 *   directory classification that formed it (`organization-style`), the files reassigned into it
 *   (`relocated-files`, bounded by D-72), single-user files of shared modules (D-46), its composition roots,
 *   utilities and barrels (D-49), its attached tests and declarations (D-64), the oversized directory it
 *   came from, and anchor drift;
 * - a one-sentence **reason** that begins with "Inferred:" (D-66).
 *
 * Wording (D-66): heuristic conclusions say that they are inferred. Every description of a structural class,
 * a relocation or an attachment names its rule, labels it "(Katedrala heuristic)" and states what triggered
 * it; a composition root that is also a declared entry point or a barrel says so before its rule, so that a
 * package's public barrel never reads as wiring code. Descriptions of weighted signals are factual sentences
 * about what was measured.
 *
 * Determinism: texts are built from fixed templates; numbers are formatted from their published (rounded,
 * D-57) values with `toFixed` (D-58), lists are sorted and bounded by `limits.maxEvidenceEntities`, and
 * nothing depends on the locale.
 */
import {
  baseName,
  compareStrings,
  directoryId,
  isWithin,
  parentPath,
  relativePath,
  sortedUnique,
} from "@katedrala/ir";
import type { Diagnostic, EntityId, FileId, InferenceInfo } from "@katedrala/ir";
import { directoryKind } from "../directories.js";
import { formatList, formatNumber, formatPercent, inferenceInfo } from "../evidence.js";
import { fileStem } from "../lexical.js";
import type {
  ClusterUnit,
  ContextSignal,
  GroupOrganization,
  InferenceSettings,
  OrganizationStyle,
  Relocation,
  Scope,
  ScopeClustering,
  UnitKind,
  WeightedSignal,
} from "../types.js";
import type { Attachment } from "./attach.js";
import { MODULE_SIGNAL_WEIGHTS, signalValue } from "./confidence.js";
import type { ModuleSignal, UnitSignals } from "./confidence.js";
import type { InferredScope } from "./declared.js";

/** `StructuralClasses.orchestratorRule` values (types.ts): the two orchestrator rules of P3. */
const ENTRY_POINT_RULE = 1;
const SHAPE_RULE = 2;

/**
 * The context signal that names the kind of each module [KATEDRALA HEURISTIC] (D-48): the IR has no module
 * kind, and feature, stem and split modules share one set of weighted signals, so one context signal per kind
 * makes the kind explicit without an IR change. Signal ids are part of the output contract.
 */
export const MODULE_KIND_SIGNALS: Readonly<Record<UnitKind, string>> = Object.freeze({
  feature: "feature-directory",
  layer: "layer-directory",
  shared: "shared-directory",
  root: "root-files",
  stem: "file-stem",
  split: "split-piece",
});

/** What {@link explainScope} reads for one clustered scope [KATEDRALA HEURISTIC] (§3.13, §5.2; plan 4.6). */
export interface ExplainScopeInput {
  /** The scope's clustering and the module identifier of each unit. */
  readonly scoped: InferredScope;
  /** P9's measurements, parallel to the units (`moduleSignals`). */
  readonly signals: readonly UnitSignals[];
  /** P7's attachments of this scope, parallel to the units (`Attachments.units[s]`). */
  readonly attachments: readonly (readonly Attachment[])[];
  /** The module method string, `moveMinSupport` (lone-file wording) and `stemMinCoverage`. */
  readonly settings: InferenceSettings;
  /** The files of the document's declared entry points (D-31). */
  readonly entryPoints: ReadonlySet<FileId>;
  /** `limits.maxEvidenceEntities`: entities per evidence entry, clauses per description (D-72). */
  readonly maxEntities: number;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────────────────────────────

/** A name or path in backticks. */
function code(text: string): string {
  return `\`${text}\``;
}

/** A directory as descriptions show it: the analysis root is `.`, as in module identifiers. */
function shown(directory: string): string {
  return code(directory === "" ? "." : directory);
}

/** `1 file`, `3 files`. */
function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The text with its first character upper-cased (ASCII; the texts start with ASCII letters or digits). */
function capitalized(text: string): string {
  const first = text.charAt(0);
  return first >= "a" && first <= "z"
    ? String.fromCharCode(first.charCodeAt(0) - 32) + text.slice(1)
    : text;
}

/** "1 of 4 files is used by two or more other modules", or the one-file variant. */
function sharedUsage(signals: UnitSignals): string {
  const shared = signals.sharedFiles.length;
  if (signals.files === 1) {
    return shared === 1
      ? "its only file is used by two or more other modules"
      : "its only file is not used by two or more other modules";
  }
  return `${shared} of ${signals.files} files ${isAre(shared)} used by two or more other modules`;
}

/** `is` for one, `are` otherwise. */
function isAre(count: number): string {
  return count === 1 ? "is" : "are";
}

/** The path of a file identifier (`file:<path>`). */
function pathOf(file: FileId): string {
  return file.slice("file:".length);
}

/** A file name without its last extension (`session.ts` → `session`); a leading dot is no extension. */
function withoutExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Items as an English list of at most `limit` entries (`limits.maxEvidenceEntities`), the rest counted:
 * "a, b and 3 more". With a limit of 0 only the count is given.
 */
function boundedList(items: readonly string[], limit: number): string {
  if (items.length <= limit) return formatList(items);
  const shown = items.slice(0, Math.max(0, limit));
  const rest = items.length - shown.length;
  return shown.length === 0 ? `${rest} more` : formatList([...shown, `${rest} more`]);
}

/** Per-file clauses joined by semicolons, at most `limit` of them, the rest counted. */
function boundedClauses(clauses: readonly string[], limit: number): string {
  const shown = clauses.slice(0, Math.max(0, limit));
  const rest = clauses.length - shown.length;
  if (rest === 0) return shown.join("; ");
  return shown.length === 0 ? `${rest} files` : `${shown.join("; ")}; and ${rest} more`;
}

/** Where evidence of a scope lies, for "no evidence" sentences. */
function insideScope(scope: Scope): string {
  return scope.id === "" ? "among the files outside packages" : "in its package";
}

/**
 * The anchor of a unit key (`inferredModuleKey`): the first `#` separates the escaped directory from the
 * stem; `.` is the analysis root; `%25`, `%23` and `%7E` are decoded.
 */
function anchorOfKey(key: string): { readonly directory: string; readonly stem?: string } {
  const hash = key.indexOf("#");
  const escaped = hash === -1 ? key : key.slice(0, hash);
  const directory =
    escaped === "."
      ? ""
      : escaped.replace(/%(25|23|7E)/g, (_, hex: string) =>
          hex === "25" ? "%" : hex === "23" ? "#" : "~",
        );
  return hash === -1 ? { directory } : { directory, stem: key.slice(hash + 1) };
}

/** A unit named by its key for a relocation sentence: its directory, or its stem group. */
function unitLabel(key: string): string {
  const anchor = anchorOfKey(key);
  return anchor.stem === undefined
    ? shown(anchor.directory)
    : `the stem group ${code(anchor.stem)} of ${shown(anchor.directory)}`;
}

// ─── Per-scope facts ──────────────────────────────────────────────────────────────────────────────────

/** Facts of a scope that several units' explanations read. */
interface ScopeFacts {
  readonly clustering: ScopeClustering;
  readonly settings: InferenceSettings;
  readonly entryPoints: ReadonlySet<FileId>;
  readonly maxEntities: number;
  /** Group organizations by directory. */
  readonly groups: ReadonlyMap<string, GroupOrganization>;
  /** Relocations into each unit, by node. */
  readonly relocatedInto: readonly (readonly Relocation[])[];
  /** Surviving P4 pieces per oversized directory. */
  readonly pieces: ReadonlyMap<string, number>;
  /**
   * Per scope node: its unit when P3 classified it, as the index of a representative unit, or -1 when that
   * unit was dropped (P6). P3 runs before P4, so the pieces and the remainder of an oversized directory form
   * one P3 unit, represented by the first of them; every other unit is its own prior.
   */
  readonly classifiedUnitOf: Int32Array;
}

/** The group whose classification explains a unit: its own group (stem units), else its parent's. */
function groupOf(facts: ScopeFacts, unit: ClusterUnit): GroupOrganization | undefined {
  if (unit.group !== undefined) return facts.groups.get(unit.group);
  const directory = unit.anchor.directory;
  if (directory === "") return undefined;
  const parent = facts.groups.get(parentPath(directory));
  if (parent === undefined) return undefined;
  const classified =
    parent.layerChildren.includes(directory) ||
    parent.featureChildren.includes(directory) ||
    parent.sharedChildren.includes(directory);
  return classified ? parent : undefined;
}

/** The scope node's file. */
function fileOf(facts: ScopeFacts, node: number): FileId {
  return facts.clustering.scope.graph.nodes[node] ?? "file:";
}

// ─── Weighted signals ─────────────────────────────────────────────────────────────────────────────────

/** How the prior of a unit was formed, for `prior-agreement` (§5.2). */
function priorDescription(facts: ScopeFacts, unit: ClusterUnit): string {
  const directory = unit.anchor.directory;
  // D-32: a P4 remainder keeps its unit's key and kind, but its prior holds only the files that joined no
  // piece.
  if (unit.oversized !== undefined && unit.kind !== "split") {
    return `the files of the oversized directory ${shown(unit.oversized.directory)} that joined no piece`;
  }
  switch (unit.kind) {
    case "stem": {
      const stem = stemPhrase(facts, unit);
      const layers = layerDirectoriesOf(facts, unit);
      return layers === undefined
        ? `${stem} below ${shown(directory)}`
        : `${stem} across ${counted(layers, "layer directory", "layer directories")}`;
    }
    case "split":
      return isStemPiece(facts, unit)
        ? `the piece of the oversized directory ${shown(directory)} around the stem ${code(unit.anchor.stem ?? "")}`
        : `the piece of the oversized directory ${shown(directory)} keyed ${code(unit.anchor.stem ?? "")}`;
    case "root":
      return `the top-level files of ${shown(directory)}`;
    case "feature":
    case "layer":
    case "shared": {
      // A directory P1 split (it has a group) keeps only its direct files in its own unit.
      const base =
        unit.oversized === undefined && facts.groups.has(directory)
          ? `the files directly in ${shown(directory)}`
          : `directory ${shown(directory)}`;
      // D-70: stem files that joined a feature child lie outside its directory.
      const outside = countOutside(facts, unit.prior, directory);
      return outside === 0
        ? base
        : `${base} together with ${counted(outside, "file")} from layer directories that share its stem`;
    }
  }
}

/** How many of `nodes` lie outside `directory`. */
function countOutside(facts: ScopeFacts, nodes: Int32Array, directory: string): number {
  let outside = 0;
  for (const node of nodes) if (!isWithin(pathOf(fileOf(facts, node)), directory)) outside++;
  return outside;
}

/**
 * How the stem of a stem unit reads: "the file-name stem `x`" when the file name of every prior member gives
 * that stem, else "the name stem `x` (of file or sub-directory names)", because P2 also takes the stem of a
 * sub-directory that recurs directly below the layer directories (D-28).
 */
function stemPhrase(facts: ScopeFacts, unit: ClusterUnit): string {
  const stem = unit.anchor.stem ?? "";
  for (const node of unit.prior) {
    if (fileStem(pathOf(fileOf(facts, node)), facts.settings.vocabulary)?.stem !== stem) {
      return `the name stem ${code(stem)} (of file or sub-directory names)`;
    }
  }
  return `the file-name stem ${code(stem)}`;
}

/** The layer children of a stem unit's group that hold prior members; undefined without the group. */
function layerDirectoriesOf(facts: ScopeFacts, unit: ClusterUnit): number | undefined {
  const group = unit.group === undefined ? undefined : facts.groups.get(unit.group);
  if (group === undefined) return undefined;
  let count = 0;
  for (const layer of group.layerChildren) {
    for (const node of unit.prior) {
      if (isWithin(pathOf(fileOf(facts, node)), layer)) {
        count++;
        break;
      }
    }
  }
  return count;
}

/** Whether a P4 piece is keyed by the stem of one of its members (else by the fallback of D-34). */
function isStemPiece(facts: ScopeFacts, unit: ClusterUnit): boolean {
  const stem = unit.anchor.stem;
  if (stem === undefined) return false;
  for (const node of unit.prior) {
    if (fileStem(pathOf(fileOf(facts, node)), facts.settings.vocabulary)?.stem === stem)
      return true;
  }
  return false;
}

/** The description and entities of one weighted signal (§5.2; D-45 for absent values). */
function weightedSignal(
  facts: ScopeFacts,
  index: number,
  signals: UnitSignals,
  attached: number,
  signal: ModuleSignal,
  weight: number,
): WeightedSignal {
  const value = signalValue(signals, signal);
  const scope = facts.clustering.scope;
  const files = (nodes: readonly number[]): EntityId[] => nodes.map((node) => fileOf(facts, node));
  const result = (description: string, entities?: readonly EntityId[]): WeightedSignal => ({
    signal,
    weight,
    ...(value === undefined ? {} : { value }),
    description,
    ...(entities === undefined || entities.length === 0 ? {} : { entities }),
  });
  switch (signal) {
    case "internal-edge-ratio":
      return result(
        value === undefined
          ? `No member file has a dependency or dependent ${insideScope(scope)} that counts as evidence ` +
              "(those of composition roots and utilities do not), so cohesion is not measured and the " +
              "signal contributes 0."
          : `${formatPercent(value)} of the dependency weight of member files stays inside the module ` +
              `(internal ${formatNumber(signals.internalWeight, 1)}, crossing ` +
              `${formatNumber(signals.cutWeight, 1)}).`,
      );
    case "membership-margin": {
      if (value === undefined) {
        return result(
          `No member file has dependents or dependencies ${insideScope(scope)} that count as evidence ` +
            "(those of composition roots and utilities do not), so the margin is not measured and the " +
            "signal contributes 0.",
        );
      }
      const contested = signals.contested.length;
      const evidence = signals.membersWithEvidence;
      let clause: string;
      if (evidence === signals.files) {
        clause =
          contested === 0
            ? "no member is contested"
            : `${contested} of ${counted(evidence, "member")} ${isAre(contested)} contested`;
      } else {
        clause =
          contested === 0
            ? `none of the ${counted(evidence, "member")} with dependency evidence is contested`
            : `${contested} of the ${counted(evidence, "member")} with dependency evidence ` +
              `${isAre(contested)} contested`;
      }
      return result(
        `On average, member files are ${formatNumber(value * 100, 0)} percentage points more connected ` +
          `to this module than to any other; ${clause}.`,
        files(signals.contested),
      );
    }
    case "prior-agreement": {
      const relocated = signals.movedIn.length + signals.movedOut.length;
      const agreement =
        relocated === 0 ? "exactly" : `except ${counted(relocated, "relocated file")}`;
      const unit = facts.clustering.units[index];
      const prior = unit === undefined ? "the prior" : priorDescription(facts, unit);
      return result(
        `The members match ${prior} ${agreement} (Jaccard ${formatNumber(value ?? 0, 2)}).`,
        sortedUnique(files([...signals.movedIn, ...signals.movedOut])),
      );
    }
    case "module-size":
      return result(
        attached === 0
          ? `The module has ${counted(signals.files, "member file")}.`
          : `The module has ${counted(signals.files, "member file")}, not counting ` +
              `${counted(attached, "attached file")}.`,
      );
    case "shared-usage":
      return result(
        `${capitalized(sharedUsage(signals))} (composition roots do not count as users).`,
        files(signals.sharedFiles),
      );
    case "wiring-share": {
      const wiring = signals.wiringFiles.length;
      let text: string;
      if (signals.files === 1) {
        text =
          wiring === 1
            ? "Its only member file is a composition root, barrel or declared entry point."
            : "Its only member file is not a composition root, barrel or declared entry point.";
      } else {
        text =
          wiring === 1
            ? `1 of ${signals.files} files is a composition root, barrel or declared entry point.`
            : `${wiring} of ${signals.files} files are composition roots, barrels or declared entry points.`;
      }
      return result(text, files(signals.wiringFiles));
    }
  }
}

// ─── Context signals ──────────────────────────────────────────────────────────────────────────────────

/** The kind signal of D-48: one per module, naming the directory or stem it was formed from. */
function kindSignal(facts: ScopeFacts, unit: ClusterUnit): ContextSignal {
  const directory = unit.anchor.directory;
  let description: string;
  switch (unit.kind) {
    case "feature":
      description = `Inferred from the feature directory ${shown(directory)}.`;
      break;
    case "layer":
      description = `Inferred from the layer directory ${shown(directory)}.`;
      break;
    case "shared":
      description =
        directory !== "" && directoryKind(directory, facts.settings.vocabulary) === "container"
          ? `Inferred from the loose files of the container directory ${shown(directory)}.`
          : `Inferred from the shared directory ${shown(directory)}.`;
      break;
    case "root":
      description = `Inferred from the top-level files of ${shown(directory)}.`;
      break;
    case "stem":
      description =
        `Inferred from ${stemPhrase(facts, unit)}, which recurs across the layer directories of ` +
        `${shown(directory)}.`;
      break;
    case "split":
      description = `Inferred from a piece of the oversized directory ${shown(directory)}.`;
      break;
  }
  return {
    signal: MODULE_KIND_SIGNALS[unit.kind],
    description,
    entities: [directoryId(directory)],
  };
}

/** The style of a group, as descriptions word it. */
const STYLE_PHRASES: Readonly<Record<OrganizationStyle, string>> = Object.freeze({
  layer: "organized by layer",
  mixed: "organized by layer and by feature (mixed)",
  feature: "organized by feature",
  none: "organized neither by feature nor by layer",
});

/** `organization-style`: how the group that formed the unit was classified (§3.6, D-26). */
function organizationSignal(facts: ScopeFacts, group: GroupOrganization): ContextSignal {
  const limit = facts.maxEntities;
  const names = (children: readonly string[]): string => boundedList(children.map(baseName), limit);
  const parts: string[] = [];
  const { layerChildren, featureChildren, sharedChildren } = group;
  if (layerChildren.length > 0) {
    parts.push(
      `${counted(layerChildren.length, "layer directory", "layer directories")} (${names(layerChildren)})`,
    );
  }
  if (featureChildren.length > 0) {
    parts.push(
      `${counted(featureChildren.length, "feature directory", "feature directories")} (${names(featureChildren)})`,
    );
  }
  if (sharedChildren.length > 0) {
    parts.push(
      `${counted(sharedChildren.length, "shared directory", "shared directories")} (${names(sharedChildren)})`,
    );
  }
  const children = parts.length === 0 ? "no layer, feature or shared directory" : formatList(parts);
  let sentence =
    "Directory classification (Katedrala heuristic, directory vocabulary): " +
    `${shown(group.directory)} has ${children}, so it is ${STYLE_PHRASES[group.style]}`;
  let value: number | undefined;
  if (layerChildren.length >= 2) {
    const { recurrentStems, coveredFiles, layerFiles } = group;
    value = layerFiles === 0 ? 0 : coveredFiles / layerFiles;
    const stems = boundedList(recurrentStems, limit);
    const coverage = `${coveredFiles} of ${counted(layerFiles, "file")}`;
    if (recurrentStems.length === 0) {
      sentence +=
        "; no file-name stem recurs across its layer directories in connected files, so the layer " +
        "directories stay modules";
    } else if (group.stemsApplied) {
      sentence +=
        recurrentStems.length === 1
          ? `; the file-name stem ${stems} recurs across its layer directories and covers ${coverage}`
          : `; file-name stems ${stems} recur across its layer directories and cover ${coverage}`;
    } else {
      sentence +=
        `; file-name ${recurrentStems.length === 1 ? "stem" : "stems"} ${stems} ` +
        `${recurrentStems.length === 1 ? "recurs" : "recur"} across its layer directories but ` +
        `${recurrentStems.length === 1 ? "covers" : "cover"} only ${coverage}, less than ` +
        `${formatPercent(facts.settings.modules.stemMinCoverage)}, so the layer directories stay modules`;
    }
  }
  const entities = [...layerChildren, ...featureChildren, ...sharedChildren]
    .sort(compareStrings)
    .map(directoryId);
  return {
    signal: "organization-style",
    description: `${sentence}.`,
    ...(value === undefined ? {} : { value }),
    ...(entities.length === 0 ? {} : { entities }),
  };
}

/**
 * One `relocated-files` entry: a file P5 moved into this unit, with the evidence of its last move (D-36: a
 * file is reported only when its final unit differs from its prior unit).
 */
function relocationSignal(facts: ScopeFacts, relocation: Relocation): ContextSignal {
  const file = fileOf(facts, relocation.node);
  let dependentFiles = 0;
  let dependentWeight = 0;
  for (const key of [...relocation.dependents.keys()].sort(compareStrings)) {
    const entry = relocation.dependents.get(key);
    dependentFiles += entry?.files ?? 0;
    dependentWeight += entry?.weight ?? 0;
  }
  let dependencyWeight = 0;
  for (const key of [...relocation.dependencies.keys()].sort(compareStrings)) {
    dependencyWeight += relocation.dependencies.get(key) ?? 0;
  }
  const here = relocation.dependents.get(relocation.to);
  const hereFiles = here?.files ?? 0;
  const hereWeight = here?.weight ?? 0;
  const dependenciesHere = relocation.dependencies.get(relocation.to) ?? 0;
  const dependents =
    `has ${hereFiles} of its ${counted(dependentFiles, "dependent")} (weight ` +
    `${formatNumber(hereWeight, 1)} of ${formatNumber(dependentWeight, 1)})`;
  let dependencies: string;
  if (dependencyWeight === 0) {
    dependencies = " in this module and no dependencies";
  } else if (dependenciesHere === dependencyWeight) {
    dependencies =
      ` and all of its dependencies (${formatNumber(dependenciesHere, 1)} of ` +
      `${formatNumber(dependencyWeight, 1)}) in this module`;
  } else {
    dependencies =
      ` and most of its dependency weight (${formatNumber(dependenciesHere, 1)} of ` +
      `${formatNumber(dependencyWeight, 1)}) in this module`;
  }
  // D-74: support below move_min_support means the lone-file exception of condition 4 applied.
  const lone =
    hereFiles < facts.settings.modules.moveMinSupport
      ? `; it was the only file left in ${unitLabel(relocation.from)}, so one dependent suffices`
      : "";
  return {
    signal: "relocated-files",
    description:
      `Reassigned here by the strict-majority rule (Katedrala heuristic): ${code(pathOf(file))} ` +
      `${dependents}${dependencies}${lone}.`,
    ...(dependentWeight > 0 ? { value: hereWeight / dependentWeight } : {}),
    entities: [file],
  };
}

/** `relocated-files` entries for the smallest file ids and the count of the rest (D-72). */
function relocationSignals(facts: ScopeFacts, index: number): ContextSignal[] {
  const relocations = facts.relocatedInto[index] ?? [];
  const limit = Math.max(0, facts.maxEntities);
  const signals = relocations
    .slice(0, limit)
    .map((relocation) => relocationSignal(facts, relocation));
  const omitted = relocations.length - signals.length;
  if (omitted > 0) {
    signals.push({
      signal: "relocated-files-omitted",
      description:
        `${omitted} further ${omitted === 1 ? "file was" : "files were"} reassigned here; entries are ` +
        "limited by limits.maxEvidenceEntities.",
      value: omitted,
    });
  }
  return signals;
}

/** `single-user-files` of a shared module (D-46): members used by exactly one other module. */
function singleUserSignal(
  facts: ScopeFacts,
  unit: ClusterUnit,
  signals: UnitSignals,
): ContextSignal | undefined {
  const singles = signals.singleUsers;
  if (singles.length === 0) return undefined;
  const clauses = singles.map(({ node, unit: user }) => {
    const path = pathOf(fileOf(facts, node));
    const name = withoutExtension(relativePath(unit.anchor.directory, path));
    return `${name} (${facts.clustering.units[user]?.name ?? ""})`;
  });
  const count = singles.length;
  return {
    signal: "single-user-files",
    description:
      `${counted(count, "file")} ${isAre(count)} used by only one other module: ` +
      `${boundedList(clauses, facts.maxEntities)}.`,
    value: count,
    entities: singles.map(({ node }) => fileOf(facts, node)),
  };
}

/** Who depends on a composition root found by the entry-point rule: nothing, or composition roots only. */
function dependedOnBy(scope: Scope, node: number): string {
  const { graph } = scope.graph;
  const dependents = (graph.inOffsets[node + 1] ?? 0) - (graph.inOffsets[node] ?? 0);
  if (scope.id === "") {
    return dependents === 0
      ? "that no file outside packages depends on"
      : "that only composition roots outside packages depend on";
  }
  return dependents === 0
    ? "that nothing in its package depends on"
    : "that only composition roots in its package depend on";
}

/**
 * Who outside its unit, as P3 saw it, depends on a composition root found by the shape rule: nothing, or
 * composition roots only (the rule ignores them as dependents).
 */
function outsideDependents(facts: ScopeFacts, node: number): string {
  const { graph } = facts.clustering.scope.graph;
  const own = facts.classifiedUnitOf[node] ?? -1;
  const end = graph.inOffsets[node + 1] ?? 0;
  for (let e = graph.inOffsets[node] ?? 0; e < end; e++) {
    if ((facts.classifiedUnitOf[graph.inSources[e] ?? -1] ?? -1) !== own) {
      return "only composition roots outside its unit depend on it";
    }
  }
  return "nothing outside its unit depends on it";
}

/** The clause of one composition root: what else it is (D-66), then the rule and what triggered it. */
function compositionRootClause(facts: ScopeFacts, node: number): string {
  const { scope, classes } = facts.clustering;
  const file = fileOf(facts, node);
  const entry = facts.entryPoints.has(file);
  const barrel = classes.facades[node] === 1;
  let detail: string;
  if (classes.orchestratorRule[node] === ENTRY_POINT_RULE) {
    detail =
      `entry-point rule: a declared entry point${barrel ? " and barrel" : ""} ` +
      dependedOnBy(scope, node);
  } else {
    const what =
      entry && barrel
        ? "a declared entry point and barrel; "
        : entry
          ? "a declared entry point; "
          : barrel
            ? "a barrel; "
            : "";
    const units = classes.dependencyUnits[node] ?? 0;
    detail =
      classes.orchestratorRule[node] === SHAPE_RULE
        ? `${what}shape rule: ${outsideDependents(facts, node)}; its dependencies spread over ` +
          `${counted(units, "other unit")}, none above 50%`
        : `${what}orchestrator rules`;
  }
  return `${code(pathOf(file))} (${detail})`;
}

/** `composition-roots`, `utility-files` and `facade-files` (D-49, D-66), for the members of each class. */
function classSignals(facts: ScopeFacts, unit: ClusterUnit): ContextSignal[] {
  const { classes, scope } = facts.clustering;
  const roots: number[] = [];
  const utilities: number[] = [];
  const barrels: number[] = [];
  for (const node of unit.members) {
    if (classes.orchestrators[node] === 1) roots.push(node);
    if (classes.utilities[node] === 1) utilities.push(node);
    if (classes.facades[node] === 1) barrels.push(node);
  }
  const limit = facts.maxEntities;
  const signals: ContextSignal[] = [];
  const signalOf = (signal: string, nodes: readonly number[], text: string): ContextSignal => ({
    signal,
    description: text,
    value: nodes.length,
    entities: nodes.map((node) => fileOf(facts, node)),
  });
  if (roots.length > 0) {
    const clauses = roots.map((node) => compositionRootClause(facts, node));
    signals.push(
      signalOf(
        "composition-roots",
        roots,
        `Treated as ${roots.length === 1 ? "a composition root" : "composition roots"} by the ` +
          "orchestrator rules (Katedrala heuristic) and not counted as evidence: " +
          `${boundedClauses(clauses, limit)}.`,
      ),
    );
  }
  if (utilities.length > 0) {
    const clauses = utilities.map((node) => {
      const units = classes.dependentUnits[node] ?? 0;
      return `${code(pathOf(fileOf(facts, node)))} (its dependents lie in ${counted(units, "other unit")})`;
    });
    signals.push(
      signalOf(
        "utility-files",
        utilities,
        `Treated as ${utilities.length === 1 ? "a shared utility" : "shared utilities"} by the utility ` +
          "rule (Katedrala heuristic), pinned and not counted as evidence: " +
          `${boundedClauses(clauses, limit)}.`,
      ),
    );
  }
  if (barrels.length > 0) {
    const { admittedOutDegree, reexportOutDegree } = scope.graph;
    const clauses = barrels.map((node) => {
      const admitted = admittedOutDegree[node] ?? 0;
      const reexports = reexportOutDegree[node] ?? 0;
      return (
        `${code(pathOf(fileOf(facts, node)))} (${reexports} of its ` +
        `${counted(admitted, "dependency", "dependencies")} ` +
        `${reexports === 1 ? "is a re-export" : "are re-exports"})`
      );
    });
    signals.push(
      signalOf(
        "facade-files",
        barrels,
        `Treated as ${barrels.length === 1 ? "a barrel" : "barrels"} by the facade rule (Katedrala ` +
          `heuristic) and pinned to ${barrels.length === 1 ? "its" : "their"} directory: ` +
          `${boundedClauses(clauses, limit)}.`,
      ),
    );
  }
  return signals;
}

/** `attached-files` (D-64): the tests and declarations attached for navigation, and by which rule. */
function attachmentSignal(
  facts: ScopeFacts,
  attachments: readonly Attachment[],
): ContextSignal | undefined {
  if (attachments.length === 0) return undefined;
  let tests = 0;
  let majority = 0;
  const directories: string[] = [];
  for (const attachment of attachments) {
    if (attachment.role === "test") tests++;
    if (attachment.rule === "majority") majority++;
    else if (attachment.directory !== undefined) directories.push(attachment.directory);
  }
  const declarations = attachments.length - tests;
  const location = attachments.length - majority;
  const modules =
    declarations === 0
      ? "the modules they depend on"
      : tests === 0
        ? "the modules that depend on them"
        : "the modules they depend on (tests) or that depend on them (declarations)";
  const places = sortedUnique(directories).map(shown);
  const where = location === 0 ? "" : ` in ${boundedList(places, facts.maxEntities)}`;
  return {
    signal: "attached-files",
    description:
      `Attached for navigation (Katedrala heuristic): ${counted(tests, "test file")} and ` +
      `${counted(declarations, "declaration file")}; ${majority} by a strict majority of ${modules}, ` +
      `${location} by location${where}.`,
    value: attachments.length,
    entities: attachments.map((attachment) => attachment.file),
  };
}

/** `oversized-directory`: the P4 directory a piece or remainder comes from. */
function oversizedSignal(unit: ClusterUnit): ContextSignal | undefined {
  const { oversized } = unit;
  if (oversized === undefined) return undefined;
  const size = counted(oversized.nodes, "file");
  return {
    signal: "oversized-directory",
    description:
      unit.kind === "split"
        ? `Part of the oversized directory ${shown(oversized.directory)} (${size}), grouped by dependencies.`
        : `The rest of the oversized directory ${shown(oversized.directory)} (${size}) after it was ` +
          "grouped by dependencies.",
    value: oversized.nodes,
    entities: [directoryId(oversized.directory)],
  };
}

/** `anchor-drift` (§5.2): emitted only when fewer than half of the members lie under the anchor. */
function driftSignal(facts: ScopeFacts, unit: ClusterUnit): ContextSignal | undefined {
  const members = unit.members.length;
  if (members === 0) return undefined;
  const directory = unit.anchor.directory;
  const under = members - countOutside(facts, unit.members, directory);
  const share = under / members;
  if (share >= 0.5) return undefined;
  return {
    signal: "anchor-drift",
    description: `Only ${formatPercent(share)} of member files lie under the anchor directory ${shown(directory)}.`,
    value: share,
  };
}

// ─── Reasons ──────────────────────────────────────────────────────────────────────────────────────────

/** "75% of their dependency weight stays inside", or why there is no such measurement (D-45). */
function insideClause(scope: Scope, signals: UnitSignals, possessive: string): string {
  const ratio = signals.internalEdgeRatio;
  return ratio === undefined
    ? `no member has dependency evidence ${insideScope(scope)}`
    : `${formatPercent(ratio)} of ${possessive} dependency weight stays inside`;
}

/** The one-sentence reason of a module (plan 4.6 templates; D-66: it begins with "Inferred:"). */
function reason(facts: ScopeFacts, unit: ClusterUnit, signals: UnitSignals): string {
  const { scope } = facts.clustering;
  const directory = unit.anchor.directory;
  const { oversized } = unit;
  // D-32: the remainder of an oversized directory keeps the directory's key and kind.
  if (oversized !== undefined && unit.kind !== "split") {
    const pieces = facts.pieces.get(oversized.directory) ?? 0;
    return (
      `Inferred: directory ${shown(directory)} (oversized: ${counted(oversized.nodes, "file")}, ` +
      `grouped into ${counted(pieces, "piece")} by dependencies); the ` +
      `${counted(signals.files, "file")} that joined no piece ${signals.files === 1 ? "stays" : "stay"} here.`
    );
  }
  switch (unit.kind) {
    case "stem": {
      const layers = layerDirectoriesOf(facts, unit);
      const where =
        layers === undefined
          ? `in the layer directories of ${shown(directory)}`
          : `in ${counted(layers, "layer directory", "layer directories")} of ${shown(directory)}`;
      const groups =
        signals.priorComponents <= 1
          ? "form a connected group"
          : `form ${signals.priorComponents} connected groups`;
      return (
        `Inferred: files with the name stem ${code(unit.anchor.stem ?? "")} ${where} ${groups}; ` +
        `${insideClause(scope, signals, "their")}.`
      );
    }
    case "feature": {
      const moved: string[] = [];
      const movedIn = signals.movedIn.length;
      const movedOut = signals.movedOut.length;
      if (movedIn > 0) moved.push(`${counted(movedIn, "file")} reassigned in`);
      if (movedOut > 0)
        moved.push(movedIn > 0 ? `${movedOut} out` : `${counted(movedOut, "file")} reassigned out`);
      const relocations = moved.length === 0 ? "" : ` with ${moved.join(" and ")}`;
      return `Inferred: directory ${shown(directory)}${relocations}; ${insideClause(scope, signals, "the")}.`;
    }
    case "layer": {
      const group = groupOf(facts, unit);
      if (group === undefined) return `Inferred: layer directory ${shown(directory)}.`;
      if (group.layerChildren.length < 2) {
        return `Inferred: layer directory ${shown(directory)}, the only layer directory in ${shown(group.directory)}.`;
      }
      const stems = group.stemsApplied
        ? "the files left in it share no recurring file-name stem"
        : group.recurrentStems.length > 0
          ? "recurring file-name stems cover too few files to form modules"
          : "no file-name stem recurs across its layers";
      return `Inferred: layer directory ${shown(directory)} in a layer-organized source tree; ${stems}.`;
    }
    case "shared": {
      const usage = sharedUsage(signals);
      return directory !== "" && directoryKind(directory, facts.settings.vocabulary) === "container"
        ? `Inferred: the loose files of the container directory ${shown(directory)}; ${usage}.`
        : `Inferred: shared directory ${shown(directory)}; ${usage}.`;
    }
    case "root": {
      const wiring = signals.wiringFiles.length;
      let treated: string;
      if (signals.files === 1) {
        treated =
          wiring === 1
            ? "it is treated as a composition root, barrel or declared entry point"
            : "it is not treated as a composition root, barrel or declared entry point";
      } else {
        treated =
          wiring === 0
            ? "none is treated as a composition root, barrel or declared entry point"
            : wiring === 1
              ? "1 is treated as a composition root, barrel or declared entry point"
              : `${wiring} are treated as composition roots, barrels or declared entry points`;
      }
      return `Inferred: the top-level files of ${shown(directory)} (${counted(signals.files, "file")}); ${treated}.`;
    }
    case "split": {
      const size = oversized === undefined ? "" : ` (${counted(oversized.nodes, "file")})`;
      const around = isStemPiece(facts, unit)
        ? `around the stem ${code(unit.anchor.stem ?? "")}`
        : `without a free common file-name stem, so it is keyed ${code(unit.anchor.stem ?? "")}`;
      return `Inferred: part of the oversized directory ${shown(directory)}${size}, grouped by dependencies ${around}.`;
    }
  }
}

// ─── Assembly ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The `InferenceInfo` of every unit of one clustered scope [KATEDRALA HEURISTIC] (§3.13, §5.2; plan 4.6),
 * parallel to `scoped.clustering.units`:
 *
 * - `method`: `settings.methods.modules` (D-56);
 * - weighted signals: those of the unit's kind ({@link MODULE_SIGNAL_WEIGHTS}), absent ones listed with
 *   their weight and a description of why they could not be computed (D-45);
 * - context signals:
 *   - the kind signal ({@link MODULE_KIND_SIGNALS}, D-48), naming the anchor directory;
 *   - `organization-style` when the unit was formed by a group's classification (a stem unit, or a
 *     classified child of a split directory), with the stem coverage as value when the group has at least
 *     two layer directories (§3.6, D-26);
 *   - `relocated-files`, one per file P5 moved in, for the smallest file ids, at most
 *     `limits.maxEvidenceEntities`, with `relocated-files-omitted` counting the rest (D-72); the value is the
 *     share of the file's dependent weight in this module, and the lone-file exception of condition 4 is
 *     named when it applied (D-74);
 *   - `single-user-files` for shared modules (D-46);
 *   - `composition-roots`, `utility-files` and `facade-files` for members of those classes (D-49), each
 *     clause naming the rule and its trigger (D-66);
 *   - `attached-files` for the tests and declarations P7 attached (D-64);
 *   - `oversized-directory` for P4 pieces and remainders;
 *   - `anchor-drift` when fewer than half of the members lie under the anchor directory;
 * - `reason`: one sentence that begins with "Inferred:" (D-66), from the templates of plan 4.6.
 *
 * Complexity: O(n · D + Σ relocations + Σ attachments) per scope plus sorting, for directory depth D (path
 * tests). Determinism: units in key order, nodes ascending, map keys sorted before they reach a text, and
 * `inferenceInfo` orders the evidence totally.
 *
 * @throws {RangeError} (from `inferenceInfo`) when `maxEntities` is not a non-negative integer.
 */
export function explainScope(input: ExplainScopeInput): InferenceInfo[] {
  const { scoped, signals, attachments, settings, entryPoints, maxEntities } = input;
  const { clustering } = scoped;
  const { units } = clustering;
  const unitIndex = new Map(units.map((unit, index) => [unit.key, index] as const));
  const relocatedInto: Relocation[][] = units.map(() => []);
  for (const relocation of [...clustering.relocations].sort((a, b) => a.node - b.node)) {
    const target = unitIndex.get(relocation.to);
    if (target !== undefined) relocatedInto[target]?.push(relocation);
  }
  const pieces = new Map<string, number>();
  for (const unit of units) {
    if (unit.kind === "split" && unit.oversized !== undefined) {
      pieces.set(unit.oversized.directory, (pieces.get(unit.oversized.directory) ?? 0) + 1);
    }
  }
  // P3 classified the units of P2: the pieces and the remainder of an oversized directory were one unit.
  const representativeOf = new Map<string, number>();
  const classifiedUnitOf = new Int32Array(clustering.scope.graph.nodes.length).fill(-1);
  units.forEach((unit, index) => {
    let representative = index;
    if (unit.oversized !== undefined) {
      representative = representativeOf.get(unit.oversized.directory) ?? index;
      representativeOf.set(unit.oversized.directory, representative);
    }
    for (const node of unit.prior) classifiedUnitOf[node] = representative;
  });
  const facts: ScopeFacts = {
    clustering,
    settings,
    entryPoints,
    maxEntities,
    groups: new Map(clustering.groups.map((group) => [group.directory, group] as const)),
    relocatedInto,
    pieces,
    classifiedUnitOf,
  };

  return units.map((unit, index) => {
    const unitSignals = signals[index];
    if (unitSignals === undefined) {
      throw new RangeError(`No measurements for unit ${unit.key} (index ${index})`);
    }
    const attached = attachments[index] ?? [];
    const weighted = MODULE_SIGNAL_WEIGHTS[unit.kind].map(({ signal, weight }) =>
      weightedSignal(facts, index, unitSignals, attached.length, signal, weight),
    );
    const context: ContextSignal[] = [kindSignal(facts, unit)];
    const group = groupOf(facts, unit);
    if (group !== undefined) context.push(organizationSignal(facts, group));
    context.push(...relocationSignals(facts, index));
    if (unit.kind === "shared") {
      const single = singleUserSignal(facts, unit, unitSignals);
      if (single !== undefined) context.push(single);
    }
    context.push(...classSignals(facts, unit));
    for (const signal of [
      attachmentSignal(facts, attached),
      oversizedSignal(unit),
      driftSignal(facts, unit),
    ]) {
      if (signal !== undefined) context.push(signal);
    }
    return inferenceInfo({
      method: settings.methods.modules,
      reason: reason(facts, unit, unitSignals),
      weighted,
      context,
      maxEntities,
    });
  });
}

/**
 * The diagnostic of a scope whose reassignment stopped at the pass limit (D-37) [KATEDRALA HEURISTIC]: an
 * `info` diagnostic `limit-reached` naming the scope, or undefined when P5 converged. Determinism is not
 * affected (every pass is deterministic); the memberships of such a scope may depend on
 * `inference.modules.max_passes`.
 *
 * Complexity: O(1). Determinism: a pure function of its argument.
 */
export function reassignmentLimitDiagnostic(clustering: ScopeClustering): Diagnostic | undefined {
  if (clustering.converged) return undefined;
  const { scope } = clustering;
  const where =
    scope.id === "" ? "the files outside packages" : `package ${scope.packageName ?? scope.id}`;
  return {
    code: "limit-reached",
    severity: "info",
    message:
      `Module reassignment in ${where} stopped after ${counted(clustering.passes, "pass", "passes")} ` +
      "with moves pending; memberships may depend on the pass limit (inference.modules.max_passes)",
  };
}
