/**
 * Architectural roles and per-file layer labels (§4.2 and the label part of §4.3; docs/ALGORITHMS.md,
 * "Architectural roles") [KATEDRALA HEURISTIC].
 *
 * Every `source` file collects layer votes from four sources, by precedence configuration > detector >
 * naming > location: configured role globs, framework detectors' role entries, its name (a dotted qualifier,
 * the last word of a multi-word name, the last word of an exported class name) and the outermost layer-named
 * directory below its scope's source root. Each vote names an architectural role, whose layer is its label,
 * or a layer directly (a location vote). The votes give:
 *
 * - `RoleEntry`s with the sources `naming`, `location` and `configuration`, merged into `FileEntity.roles`
 *   by {@link withRoles}; detector entries stay as they are;
 * - a `FileLabel` per file: votes combine by maximum within a source and by noisy-OR across sources (D-14;
 *   Pearl, J. 1988. "Probabilistic Reasoning in Intelligent Systems". Morgan Kaufmann, used here as a scoring
 *   rule, not as a probability model). Layers (`layers/*.ts`) and module names (P6) read the labels.
 *
 * File names as architectural evidence follow Anquetil, N. & Lethbridge, T. C. 1999. "Recovering software
 * architecture from the names of source files". Journal of Software Maintenance: Research and Practice
 * 11(3):201–221; the vocabularies encode TypeScript/JavaScript conventions and are configurable
 * (`vocabulary.ts`, `settings.ts`).
 *
 * Determinism: files in id order, votes in a total order, products in sorted source order, scores compared
 * after `roundMetric` (D-67); names are matched with ASCII-only lexing (D-05). Nothing depends on the order of
 * the document's arrays.
 */
import {
  baseName,
  canonicalJson,
  compareStrings,
  defaultLimits,
  directoryId,
  isWithin,
  parentPath,
  roundMetric,
  sortById,
} from "@katedrala/ir";
import type {
  ArchitecturalRole,
  EntityId,
  Evidence,
  FileEntity,
  FileId,
  PackageId,
  RoleEntry,
} from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import { directoryLayer, sourceRoot } from "./directories.js";
import { nameParts, sStem, tokenize } from "./lexical.js";
import type {
  ConfiguredRoleSpec,
  FileLabel,
  LayerVote,
  RoleSignal,
  RolesInput,
  RolesResult,
  VoteSource,
  Vocabulary,
} from "./types.js";

/**
 * The confidence of each vote rule [KATEDRALA HEURISTIC] (§4.2, plan 5.3): constants of the layer method
 * (`katedrala/layer-inference@1`), not configuration. A configured role is certain; a dotted qualifier
 * (`payment.controller.ts`) is a deliberate convention; a word suffix of a file or class name is weaker; a
 * layer-named directory sits in between.
 */
export const VOTE_CONFIDENCES: Readonly<{
  configuration: number;
  nameQualifier: number;
  nameSuffix: number;
  typeNameSuffix: number;
  location: number;
}> = Object.freeze({
  configuration: 1,
  nameQualifier: 0.8,
  nameSuffix: 0.6,
  typeNameSuffix: 0.6,
  location: 0.7,
});

/**
 * The `RoleEntry.source`s inference writes [DERIVED] (D-20): replaced on every run and never read as votes,
 * so running inference on its own output gives the same roles. Every other source is a framework detector.
 */
export const INFERRED_ROLE_SOURCES: ReadonlySet<string> = new Set([
  "configuration",
  "location",
  "naming",
]);

/** Source precedence (§4.3): configuration > detector > naming > location. */
const PRECEDENCE: Readonly<Record<VoteSource, number>> = {
  configuration: 3,
  detector: 2,
  naming: 1,
  location: 0,
};

/** A vote with the evidence description of the role entry it supports. */
interface DescribedVote {
  readonly vote: LayerVote;
  readonly description: string;
}

/** What every file's votes are collected from. */
interface RoleContext {
  readonly model: ArchitectureModel;
  readonly vocabulary: Vocabulary;
  /** Configured roles per file, in role order. */
  readonly configured: ReadonlyMap<FileId, readonly ArchitecturalRole[]>;
  /** Source root per scope (package id, or "" without a package). */
  readonly sourceRoots: ReadonlyMap<PackageId | "", string>;
}

/** The layer a role votes for: its `roleLayers` entry, else ⊥ (null, cross-cutting, §4.3). */
function layerOfRole(role: ArchitecturalRole, vocabulary: Vocabulary): string | null {
  return vocabulary.roleLayers.get(role) ?? null;
}

/** Configured roles per file: `ConfiguredRoleSpec`s are sorted by role, so each list is in role order. */
function configuredRolesByFile(
  specs: readonly ConfiguredRoleSpec[],
): ReadonlyMap<FileId, ArchitecturalRole[]> {
  const byFile = new Map<FileId, ArchitecturalRole[]>();
  for (const spec of [...specs].sort((a, b) => compareStrings(a.role, b.role))) {
    for (const file of spec.files) {
      const roles = byFile.get(file);
      if (roles === undefined) byFile.set(file, [spec.role]);
      else if (!roles.includes(spec.role)) roles.push(spec.role);
    }
  }
  return byFile;
}

/**
 * The source root of every scope over all of its `source` files (D-11): declared-module files included, so
 * that declaring a module never changes another file's location vote.
 */
function sourceRootsByScope(
  model: ArchitectureModel,
  sources: readonly FileEntity[],
): ReadonlyMap<PackageId | "", string> {
  const pathsByScope = new Map<PackageId | "", string[]>();
  for (const file of sources) {
    const scope = file.package ?? "";
    const paths = pathsByScope.get(scope);
    if (paths === undefined) pathsByScope.set(scope, [file.path]);
    else paths.push(file.path);
  }
  const roots = new Map<PackageId | "", string>();
  for (const [scope, paths] of pathsByScope) {
    const directory = scope === "" ? "" : (model.index.package(scope)?.path ?? "");
    roots.set(scope, sourceRoot(directory, paths));
  }
  return roots;
}

/**
 * The location of a file (D-18): the outermost directory strictly below its scope's source root whose
 * `directoryKind` is `layer`, with the layer it names. The kind precedence of D-08 applies, so a container
 * such as `domains/` never votes. A file outside its source root (a malformed document) is read from the
 * analysis root.
 */
function locationOf(
  path: string,
  root: string,
  vocabulary: Vocabulary,
): { readonly label: string; readonly directory: string } | undefined {
  const base = isWithin(path, root) ? root : "";
  const directory = parentPath(path);
  if (directory === base) return undefined;
  let current = base;
  for (const segment of (base === "" ? directory : directory.slice(base.length + 1)).split("/")) {
    current = current === "" ? segment : `${current}/${segment}`;
    const label = directoryLayer(segment, vocabulary);
    if (label !== undefined) return { label, directory: current };
  }
  return undefined;
}

/** A naming vote for the role a vocabulary key names, or undefined when the key names none. */
function namingVote(
  key: string,
  vocabulary: Vocabulary,
  signal: RoleSignal,
  confidence: number,
  subject: EntityId,
  describe: (role: ArchitecturalRole) => string,
): DescribedVote | undefined {
  const role = vocabulary.namingSuffixes.get(sStem(key));
  if (role === undefined) return undefined;
  return {
    vote: {
      label: layerOfRole(role, vocabulary),
      confidence,
      source: "naming",
      producer: "naming",
      role,
      signal,
      subject,
    },
    description: describe(role),
  };
}

/** The votes of one `source` file (plan 4.3's table), each with its evidence description (D-66). */
function collectVotes(
  file: FileEntity,
  context: RoleContext,
): {
  readonly votes: readonly DescribedVote[];
  readonly location: { readonly label: string; readonly directory: string } | undefined;
} {
  const { model, vocabulary } = context;
  const votes: DescribedVote[] = [];
  const name = baseName(file.path);

  // Configuration: each configured role glob that matches the file.
  for (const role of context.configured.get(file.id) ?? []) {
    votes.push({
      vote: {
        label: layerOfRole(role, vocabulary),
        confidence: VOTE_CONFIDENCES.configuration,
        source: "configuration",
        producer: "configuration",
        role,
        signal: "configured-glob",
      },
      description: `The file matches \`inference.roles.${role}\`.`,
    });
  }

  // Detectors: their entries vote with their own confidence; inference's own entries never do (D-20).
  for (const entry of file.roles ?? []) {
    if (INFERRED_ROLE_SOURCES.has(entry.source)) continue;
    votes.push({
      vote: {
        label: layerOfRole(entry.role, vocabulary),
        confidence: entry.confidence,
        source: "detector",
        producer: entry.source,
        role: entry.role,
        signal: "detector-role",
        subject: file.id,
      },
      description: `The ${entry.source} detector assigns \`${entry.role}\`.`,
    });
  }

  // Naming: the last qualifier that the vocabulary knows (D-15: `payment.controller.ts`).
  const { head, qualifiers } = nameParts(file.path);
  for (let index = qualifiers.length - 1; index >= 0; index--) {
    const qualifier = qualifiers[index] ?? "";
    const vote = namingVote(
      qualifier,
      vocabulary,
      "name-qualifier",
      VOTE_CONFIDENCES.nameQualifier,
      file.id,
      (role) =>
        `Naming rule (Katedrala heuristic): the file name \`${name}\` has the qualifier \`${qualifier}\`, which the naming vocabulary maps to \`${role}\`.`,
    );
    if (vote !== undefined) {
      votes.push(vote);
      break;
    }
  }

  // Naming: the last word of the head, when the head has at least two words (D-15: `dto.ts` is no suffix).
  const words = tokenize(head);
  const lastWord = words.length >= 2 ? words[words.length - 1] : undefined;
  if (lastWord !== undefined) {
    const vote = namingVote(
      lastWord.key,
      vocabulary,
      "name-suffix",
      VOTE_CONFIDENCES.nameSuffix,
      file.id,
      (role) =>
        `Naming rule (Katedrala heuristic): the file name \`${name}\` ends with the word \`${lastWord.key}\`, which the naming vocabulary maps to \`${role}\`.`,
    );
    if (vote !== undefined) votes.push(vote);
  }

  // Naming: the last word of each exported top-level class (D-16; none without `detail.symbols`).
  for (const symbol of model.index.symbolsOf(file.id)) {
    if (symbol.kind !== "class" || !symbol.exported || symbol.parent !== undefined) continue;
    // D-17: a class that declares another role (an in-file test module) is not production code.
    if (symbol.role !== undefined && symbol.role !== "source") continue;
    const classWords = tokenize(symbol.name);
    // D-15: a word suffix needs at least two words, for class names as for file names (`class Service`).
    const classWord = classWords.length >= 2 ? classWords[classWords.length - 1] : undefined;
    if (classWord === undefined) continue;
    const vote = namingVote(
      classWord.key,
      vocabulary,
      "type-name-suffix",
      VOTE_CONFIDENCES.typeNameSuffix,
      symbol.id,
      (role) =>
        `Naming rule (Katedrala heuristic): the exported class \`${symbol.name}\` ends with the word \`${classWord.key}\`, which the naming vocabulary maps to \`${role}\`.`,
    );
    if (vote !== undefined) votes.push(vote);
  }

  // Location (D-18): the outermost layer-kind directory below the source root.
  const location = locationOf(
    file.path,
    context.sourceRoots.get(file.package ?? "") ?? "",
    vocabulary,
  );
  if (location !== undefined) {
    // D-18: a location vote produces a role only when exactly one role maps to its layer.
    const role = vocabulary.locationRoles.get(location.label);
    votes.push({
      vote: {
        label: location.label,
        confidence: VOTE_CONFIDENCES.location,
        source: "location",
        producer: "location",
        ...(role === undefined ? {} : { role }),
        signal: "directory-name",
        subject: directoryId(location.directory),
      },
      description: `Location rule (Katedrala heuristic): the file lies in \`${location.directory}\`, which the directory vocabulary maps to the layer \`${location.label}\`.`,
    });
  }
  return { votes, location };
}

/** `a` before `b` when absent, else by `compareStrings`. */
function compareOptional(a: string | undefined | null, b: string | undefined | null): number {
  if (a === undefined || a === null || b === undefined || b === null) {
    return (a === undefined || a === null ? 0 : 1) - (b === undefined || b === null ? 0 : 1);
  }
  return compareStrings(a, b);
}

/**
 * The order of `FileLabel.votes`: source precedence, then label (⊥ first), then signal; producer, role,
 * confidence (descending) and subject make it total.
 */
function compareVotes(a: LayerVote, b: LayerVote): number {
  return (
    PRECEDENCE[b.source] - PRECEDENCE[a.source] ||
    compareOptional(a.label, b.label) ||
    compareStrings(a.signal, b.signal) ||
    compareStrings(a.producer, b.producer) ||
    compareOptional(a.role, b.role) ||
    b.confidence - a.confidence ||
    compareOptional(a.subject, b.subject)
  );
}

/** One label's score and the precedence of its strongest vote. */
interface LabelScore {
  readonly label: string | null;
  /** `roundMetric` of the noisy-OR score (D-67: equal products computed in different orders tie). */
  readonly score: number;
  readonly precedence: number;
}

/**
 * The noisy-OR score of every label (D-14): within a source the maximum confidence counts (each detector id
 * is its own source); across sources `s(L) = 1 − Π_σ (1 − c_σ(L))`, multiplied in sorted source order.
 */
function labelScores(votes: readonly LayerVote[]): LabelScore[] {
  const bySource = new Map<string | null, Map<string, number>>();
  const strongest = new Map<string | null, LayerVote>();
  for (const vote of votes) {
    // D-14: votes of one source are correlated observations of one convention.
    const source = vote.source === "detector" ? `detector:${vote.producer}` : vote.source;
    let sources = bySource.get(vote.label);
    if (sources === undefined) {
      sources = new Map();
      bySource.set(vote.label, sources);
    }
    sources.set(source, Math.max(sources.get(source) ?? 0, vote.confidence));
    const best = strongest.get(vote.label);
    if (
      best === undefined ||
      vote.confidence > best.confidence ||
      (vote.confidence === best.confidence && PRECEDENCE[vote.source] > PRECEDENCE[best.source])
    ) {
      strongest.set(vote.label, vote);
    }
  }
  const scores: LabelScore[] = [];
  for (const [label, sources] of bySource) {
    let product = 1;
    for (const source of [...sources.keys()].sort(compareStrings)) {
      product *= 1 - (sources.get(source) ?? 0);
    }
    const vote = strongest.get(label);
    scores.push({
      label,
      score: roundMetric(1 - product),
      precedence: vote === undefined ? 0 : PRECEDENCE[vote.source],
    });
  }
  return scores;
}

/**
 * The winner among label scores (§4.3): the highest score, compared after `roundMetric` (D-67); ties go to
 * the label whose strongest vote has the higher source precedence, then to ⊥ (D-19: no layer rather than a
 * guess), then to the smaller name.
 */
function compareLabelScores(a: LabelScore, b: LabelScore): number {
  return (
    b.score - a.score ||
    b.precedence - a.precedence ||
    // D-19: on an exact tie ⊥ wins over a named label.
    compareOptional(a.label, b.label)
  );
}

/** Evidence of one role entry: decreasing value, then signal, then description (strongest first). */
function compareEvidence(a: Evidence, b: Evidence): number {
  return (
    (b.value ?? 0) - (a.value ?? 0) ||
    compareStrings(a.signal, b.signal) ||
    compareStrings(a.description, b.description) ||
    compareOptional(a.entities?.[0], b.entities?.[0])
  );
}

/** Role entries sorted by role, then source (the IR's order of `FileEntity.roles`). */
function compareRoleEntries(a: RoleEntry, b: RoleEntry): number {
  return compareStrings(a.role, b.role) || compareStrings(a.source, b.source);
}

/**
 * The `naming`, `location` and `configuration` role entries of a file: one per role and source, whose
 * confidence is the maximum of its signals (D-14) and whose evidence lists each signal with its confidence as
 * `value` (plan 4.6, "Role evidence").
 */
function roleEntries(votes: readonly DescribedVote[], maxEntities: number): RoleEntry[] {
  const entries = new Map<string, RoleEntry>();
  for (const { vote, description } of votes) {
    if (vote.role === undefined || vote.source === "detector") continue;
    const key = `${vote.role}\n${vote.source}`;
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = { role: vote.role, confidence: 0, source: vote.source, evidence: [] };
      entries.set(key, entry);
    }
    // D-14: the maximum of the entry's signals; D-57: published numbers are rounded with roundMetric.
    entry.confidence = Math.max(entry.confidence, roundMetric(vote.confidence));
    const evidence: Evidence = {
      signal: vote.signal,
      description,
      value: roundMetric(vote.confidence),
    };
    // IR: entities are bounded by limits.maxEvidenceEntities.
    if (vote.subject !== undefined && maxEntities > 0) evidence.entities = [vote.subject];
    entry.evidence.push(evidence);
  }
  return [...entries.values()]
    .map((entry) => ({ ...entry, evidence: entry.evidence.sort(compareEvidence) }))
    .sort(compareRoleEntries);
}

/**
 * Assign architectural roles and per-file layer labels [KATEDRALA HEURISTIC] (§4.2, §4.3, plan 4.3).
 *
 * Only `source` files take part (D-17: roles describe production code, and layers contain only source files;
 * a configured glob matching a test does not make it a controller). For each, in id order, the votes are:
 *
 * | Source | Vote | Confidence | Role entry |
 * | --- | --- | --- | --- |
 * | configuration | each configured role whose files include it; label `roleLayers(role) ?? ⊥` | 1.0 | `configured-glob` |
 * | detector | each existing entry of another source than naming, location or configuration | its own | none (kept) |
 * | naming | the last qualifier whose S-stem is a naming suffix (`payment.controller.ts`) | 0.8 | `name-qualifier` |
 * | naming | the last word of a head of at least two words (D-15: `payment-controller.ts`) | 0.6 | `name-suffix` |
 * | naming | the last word of each exported top-level class name (D-16) | 0.6 | `type-name-suffix` |
 * | location | the outermost layer-kind directory below the scope's source root (D-18) | 0.7 | `directory-name`, only when one role maps to its layer |
 *
 * A role entry's confidence is the maximum of its signals; label scores combine by maximum within a source
 * and noisy-OR across sources (D-14), so the file-name and class-name suffixes of `SqlBookRepository` in
 * `sql-book-repository.ts` count once (0.6) and its `infrastructure` location (0.7) wins. The label is the
 * winning label (ties: precedence, then ⊥ (D-19), then name) when it is not ⊥ and its score, after
 * `roundMetric`, is at least `settings.layers.minLabelScore`. Existing naming, location and configuration
 * entries are never votes (D-20). Evidence descriptions name the rule and the vocabulary entry (D-66).
 *
 * `roles` lists the new entries of every file that has one (by role, then source); `labels` has a
 * `FileLabel` for every source file with at least one vote. Both maps iterate in file id order.
 *
 * Complexity: O(F log F + Σ path depth + exported classes) time, O(F) memory. Determinism: files in id
 * order; every list in a total order; scores compared after `roundMetric`; ASCII-only lexing (D-05).
 */
export function inferRoles(input: RolesInput): RolesResult {
  const { model, settings, configured } = input;
  const vocabulary = settings.vocabulary;
  const sources = sortById(model.document.files.filter((file) => file.role === "source"));
  const context: RoleContext = {
    model,
    vocabulary,
    configured: configuredRolesByFile(configured),
    sourceRoots: sourceRootsByScope(model, sources),
  };
  const maxEntities =
    model.document.limits?.maxEvidenceEntities ?? defaultLimits().maxEvidenceEntities;
  const roles = new Map<FileId, readonly RoleEntry[]>();
  const labels = new Map<FileId, FileLabel>();
  for (const file of sources) {
    const { votes, location } = collectVotes(file, context);
    if (votes.length === 0) continue;
    const entries = roleEntries(votes, maxEntities);
    if (entries.length > 0) roles.set(file.id, entries);
    // Every file here has a vote, so there is a winner; the default only satisfies the type checker.
    const [winner = { label: null, score: 0, precedence: 0 }] = labelScores(
      votes.map(({ vote }) => vote),
    ).sort(compareLabelScores);
    // §4.3: ⊥ means no layer; a named label needs minLabelScore (compared on the rounded score, D-67).
    const label =
      winner.label !== null && winner.score >= settings.layers.minLabelScore ? winner.label : null;
    labels.set(file.id, {
      file: file.id,
      votes: votes.map(({ vote }) => vote).sort(compareVotes),
      label,
      score: winner.score,
      ...(location === undefined ? {} : { location }),
    });
  }
  return { roles, labels };
}

/**
 * Merge inferred role entries into files [DERIVED] (D-20, plan 4.3): every file keeps its entries of other
 * sources (framework detectors) and gets exactly the `naming`, `location` and `configuration` entries of
 * `roles` (none when it has no entry there), sorted by role, then source. Files whose entries do not change
 * are returned as they are; the others are shallow copies (copy-on-write), with `roles` omitted when empty
 * and placed before `tags`, as in the IR's `FileEntity`.
 *
 * Complexity: O(Σ entries · log entries) time. Determinism: the result depends only on the inputs; entries
 * are compared as canonical JSON.
 */
export function withRoles(
  files: readonly FileEntity[],
  roles: ReadonlyMap<FileId, readonly RoleEntry[]>,
): FileEntity[] {
  return files.map((file) => {
    const existing = file.roles ?? [];
    // D-20: inference's own entries are replaced, never merged.
    const merged = [
      ...existing.filter((entry) => !INFERRED_ROLE_SOURCES.has(entry.source)),
      ...(roles.get(file.id) ?? []),
    ].sort(compareRoleEntries);
    if (canonicalJson(merged) === canonicalJson(existing)) return file;
    const { roles: _previous, tags, ...rest } = file;
    return merged.length === 0 ? { ...rest, tags } : { ...rest, roles: merged, tags };
  });
}
