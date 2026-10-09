/**
 * Hand-built `ScopeClustering` values for the unit tests of the module stage (plan 6.4: "P7–P9 and the
 * declared modules are tested with hand-built `ScopeClustering` values"), so that declared modules, P0 and
 * P7–P9 are tested independently of the clustering phases P1–P6 (U3).
 *
 * A clustering is described by paths: units with their final and prior members, the P3 classes with their
 * triggers, group organizations and relocations. {@link handClustering} turns the description into the
 * `ScopeClustering` that `clusterScope` would return for the scope, checking that every node of the scope
 * belongs to exactly one unit.
 *
 * Not part of the package build (`tsconfig.build.json` excludes `*test-support.ts`). These are test inputs,
 * not analysis results, so no truth label applies to them.
 */
import { compareStrings, fileId, inferredModuleKey } from "@katedrala/ir";
import type { ModuleAnchor } from "@katedrala/ir";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import { DEFAULT_EDGE_KINDS, DEFAULT_FILE_ROLES } from "@katedrala/model";
import { resolveInferenceSettings } from "../settings.js";
import type {
  ClusterUnit,
  DeclaredModuleSpec,
  GroupOrganization,
  InferenceSettings,
  OrganizationStyle,
  Relocation,
  Scope,
  ScopeClustering,
  UnitKind,
} from "../types.js";
import { attachFiles } from "./attach.js";
import type { Attachments } from "./attach.js";
import { identifyInferredModules, resolveDeclaredModules } from "./declared.js";
import type { DeclaredModules, InferredScope } from "./declared.js";
import { entryPointFiles, moduleScopes } from "./scopes.js";

/** One unit of a hand-built clustering, by paths. */
export interface HandUnit {
  readonly anchor: ModuleAnchor;
  readonly kind: UnitKind;
  /** Default: the stem, else the last segment of the anchor directory. */
  readonly name?: string;
  /** Final node members (paths, any order). */
  readonly members: readonly string[];
  /** Prior members (paths, any order); default: the members. */
  readonly prior?: readonly string[];
  readonly group?: string;
  readonly oversized?: { readonly directory: string; readonly nodes: number };
}

/** A relocation of a hand-built clustering, by path and unit keys. */
export interface HandRelocation {
  readonly path: string;
  readonly from: string;
  readonly to: string;
  readonly dependents: Readonly<
    Record<string, { readonly weight: number; readonly files: number }>
  >;
  readonly dependencies?: Readonly<Record<string, number>>;
}

/** The description of a hand-built clustering. */
export interface HandClusteringSpec {
  readonly units: readonly HandUnit[];
  /** Composition roots: path → [rule (1 entry point, 2 shape), dependency units]. */
  readonly orchestrators?: Readonly<
    Record<string, readonly [rule: 1 | 2, dependencyUnits: number]>
  >;
  /** Utilities: path → dependent units. */
  readonly utilities?: Readonly<Record<string, number>>;
  readonly facades?: readonly string[];
  readonly groups?: readonly GroupOrganization[];
  readonly relocations?: readonly HandRelocation[];
  /** Default: the scope directory. */
  readonly sourceRoot?: string;
  /** Default 1. */
  readonly passes?: number;
  /** Default true. */
  readonly converged?: boolean;
}

/** The style of D-26 for a group with these children (as P2 classifies it). */
function styleOf(layers: number, features: number): OrganizationStyle {
  if (layers >= 2) return features >= 1 ? "mixed" : "layer";
  return features >= 1 ? "feature" : "none";
}

/**
 * A `GroupOrganization` with defaults: no children, no stems, the D-26 style of its children unless given.
 */
export function handGroup(
  group: Partial<GroupOrganization> & { readonly directory: string },
): GroupOrganization {
  const layerChildren = group.layerChildren ?? [];
  const featureChildren = group.featureChildren ?? [];
  return {
    directory: group.directory,
    style: group.style ?? styleOf(layerChildren.length, featureChildren.length),
    layerChildren,
    featureChildren,
    sharedChildren: group.sharedChildren ?? [],
    recurrentStems: group.recurrentStems ?? [],
    coveredFiles: group.coveredFiles ?? 0,
    layerFiles: group.layerFiles ?? 0,
    stemsApplied: group.stemsApplied ?? false,
  };
}

/** Ascending scope nodes of paths; throws on a path that is not a node of the scope. */
function nodesOf(scope: Scope, paths: readonly string[]): Int32Array {
  const nodes = paths.map((path) => {
    const node = scope.graph.indexOf(fileId(path));
    if (node === -1) throw new Error(`${path} is not a node of scope "${scope.id}"`);
    return node;
  });
  return Int32Array.from(nodes.sort((a, b) => a - b));
}

/**
 * The `ScopeClustering` described by `spec` for `scope`: units sorted by key (`inferredModuleKey` of the
 * anchor), `unitOf` from the final members, the P3 class arrays from the listed paths.
 *
 * @throws {Error} when a path is not a node of the scope, or when the units do not partition the nodes.
 */
export function handClustering(scope: Scope, spec: HandClusteringSpec): ScopeClustering {
  const n = scope.graph.nodes.length;
  const units: ClusterUnit[] = spec.units
    .map((unit): ClusterUnit => {
      const members = nodesOf(scope, unit.members);
      const directory = unit.anchor.directory;
      const name =
        unit.name ??
        unit.anchor.stem ??
        (directory === "" ? "repository" : (directory.split("/").at(-1) ?? directory));
      return {
        key: inferredModuleKey(unit.anchor),
        anchor: unit.anchor,
        kind: unit.kind,
        name,
        members,
        prior: unit.prior === undefined ? Int32Array.from(members) : nodesOf(scope, unit.prior),
        ...(unit.group === undefined ? {} : { group: unit.group }),
        ...(unit.oversized === undefined ? {} : { oversized: unit.oversized }),
        destination: unit.kind === "feature" || unit.kind === "stem" || unit.kind === "split",
      };
    })
    .sort((a, b) => compareStrings(a.key, b.key));
  const unitOf = new Int32Array(n).fill(-1);
  units.forEach((unit, index) => {
    for (const node of unit.members) {
      if (unitOf[node] !== -1) throw new Error(`node ${node} is in two units`);
      unitOf[node] = index;
    }
  });
  const unassigned = [...unitOf].findIndex((unit) => unit === -1);
  if (unassigned !== -1) {
    throw new Error(`${scope.graph.nodes[unassigned] ?? "?"} is in no unit`);
  }

  const orchestrators = new Uint8Array(n);
  const orchestratorRule = new Uint8Array(n);
  const dependencyUnits = new Int32Array(n);
  for (const [path, [rule, reached]] of Object.entries(spec.orchestrators ?? {})) {
    const [node = -1] = nodesOf(scope, [path]);
    orchestrators[node] = 1;
    orchestratorRule[node] = rule;
    dependencyUnits[node] = reached;
  }
  const utilities = new Uint8Array(n);
  const dependentUnits = new Int32Array(n);
  for (const [path, dependents] of Object.entries(spec.utilities ?? {})) {
    const [node = -1] = nodesOf(scope, [path]);
    utilities[node] = 1;
    dependentUnits[node] = dependents;
  }
  const facades = new Uint8Array(n);
  for (const node of nodesOf(scope, spec.facades ?? [])) facades[node] = 1;

  const relocations: Relocation[] = (spec.relocations ?? [])
    .map((relocation): Relocation => {
      const [node = -1] = nodesOf(scope, [relocation.path]);
      return {
        node,
        from: relocation.from,
        to: relocation.to,
        dependents: new Map(Object.entries(relocation.dependents)),
        dependencies: new Map(Object.entries(relocation.dependencies ?? {})),
      };
    })
    .sort((a, b) => a.node - b.node);

  return {
    scope,
    sourceRoot: spec.sourceRoot ?? scope.directory,
    units,
    unitOf,
    classes: {
      orchestrators,
      orchestratorRule,
      dependencyUnits,
      utilities,
      dependentUnits,
      facades,
    },
    groups: [...(spec.groups ?? [])].sort((a, b) => compareStrings(a.directory, b.directory)),
    relocations,
    passes: spec.passes ?? 1,
    converged: spec.converged ?? true,
  };
}

/** The metrics projection with default core settings: default edge kinds, type-only edges, source and declarations. */
export const METRICS_PROJECTION: ProjectionOptions = Object.freeze({
  edgeKinds: new Set(DEFAULT_EDGE_KINDS),
  includeTypeOnly: true,
  fileRoles: new Set(DEFAULT_FILE_ROLES),
});

/** The unit-level module stage on hand-built clusterings: declared modules, P0, identities and P7. */
export interface HandStage {
  readonly settings: InferenceSettings;
  readonly declared: DeclaredModules;
  readonly scopes: readonly Scope[];
  readonly inferred: readonly InferredScope[];
  readonly attachments: Attachments;
}

/**
 * Run the declared modules, P0, the identities and P7 on `model`, with each scope's clustering built by
 * `cluster` (by scope id) instead of `clusterScope`.
 */
export function handStage(
  model: ArchitectureModel,
  cluster: (scope: Scope) => HandClusteringSpec,
  options: {
    readonly settings?: InferenceSettings;
    readonly declared?: readonly DeclaredModuleSpec[];
    readonly projection?: ProjectionOptions;
  } = {},
): HandStage {
  const settings = options.settings ?? resolveInferenceSettings();
  const projection = options.projection ?? METRICS_PROJECTION;
  const declared = resolveDeclaredModules({
    model,
    specs: options.declared ?? [],
    fileRoles: settings.componentFileRoles,
    maxExamples: model.document.limits?.maxEvidenceEntities ?? 10,
  });
  const { scopes } = moduleScopes({
    model,
    settings,
    projection,
    declaredFiles: new Set(declared.owners.keys()),
  });
  const inferred = identifyInferredModules(
    scopes.map((scope) => handClustering(scope, cluster(scope))),
    declared,
  );
  const attachments = attachFiles({ model, settings, projection, declared, inferred });
  return { settings, declared, scopes, inferred, attachments };
}

/** The files of the model's declared entry points (D-31), re-exported for the tests. */
export { entryPointFiles };
