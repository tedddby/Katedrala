/**
 * Architecture analysis: the observed structure (`analyzeStructure`) followed by the inference stage, which
 * contributes components, modules, layers and architectural roles (milestone 5 plan 2.3, 3.4).
 */
import { performance } from "node:perf_hooks";
import { sortDiagnostics, type EffectiveCoreSettings } from "@katedrala/core";
import {
  inferArchitecture,
  resolveInferenceSettings,
  withRoles,
  type InferenceConfiguration,
  type InferenceInput,
  type InferenceResult,
  type InferenceSettings,
  type LayersConfiguration,
  type ModulesConfiguration,
} from "@katedrala/inference";
import {
  fileId,
  type ArchitectureDocument,
  type FileEntity,
  type FileId,
  type ProjectionInfo,
  type RoleEntry,
  type RunInfo,
} from "@katedrala/ir";
import { ArchitectureModel, toProjectionInfo } from "@katedrala/model";
import type { SnapshotConfiguration } from "./configuration.js";
import { resolveDeclarations } from "./declarations.js";
import { INFERENCE_CONFIGURATION_SECTIONS } from "./inference-configuration.js";
import { metricsProjectionOptions } from "./projection.js";
import { analyzeStructure, type AnalyzeOptions, type StructureDocument } from "./structure.js";

/**
 * The structural sections plus the architectural view: components [DERIVED], modules and layers
 * [KATEDRALA HEURISTIC for inferred ones, each with confidence and evidence; declared ones are exact], and
 * inferred roles in `files[].roles` [KATEDRALA HEURISTIC]. The sections of later milestones (`endpoints`,
 * `metrics`, `anomalies`, `violations`, `rules`) are absent rather than empty, so that nothing reads as a
 * measurement that was not made (plan 1.2). Valid against the strict schema once merged with
 * `emptyDocument()`, and canonical as produced: `canonicalizeDocument` of that merge changes nothing.
 * References: plan 3.4, 4.8; docs/IR.md.
 */
export type ArchitectureSections = StructureDocument &
  Pick<ArchitectureDocument, "components" | "modules" | "layers">;

/**
 * The result of {@link analyzeArchitecture}: the observed structure, components [DERIVED], and roles, modules
 * and layers [KATEDRALA HEURISTIC when inferred]. Everything except `run` is a deterministic function of the
 * snapshot, the configuration, the caller's options and the Katedrala version. References: plan 3.4.
 */
export interface ArchitectureAnalysis {
  /** Canonical (every array in IR order); `files[].roles` include the inferred roles. */
  readonly document: ArchitectureSections;
  /** Graph model over `document` (a view of it), for projections at every level. */
  readonly model: ArchitectureModel;
  /** Volatile facts about this run, `timings.inference` included; never part of the document's identity. */
  readonly run: RunInfo;
  readonly configuration: SnapshotConfiguration;
  readonly settings: EffectiveCoreSettings;
  /** The effective inference settings, defaults applied, with the method strings (D-56). */
  readonly inference: InferenceSettings;
  /**
   * The projection aggregated dependencies were computed on (`metricsProjectionOptions`); milestone 6 writes
   * the same value to `metrics.projection`.
   */
  readonly projection: ProjectionInfo;
}

/**
 * The functions of `@katedrala/inference` the inference stage calls (plan 3.2) [DERIVED: wiring only; the
 * conclusions are the functions' own]: `inferArchitecture`, and `withRoles`, which merges the inferred roles
 * into the files copy-on-write (replacing earlier `naming`, `location` and `configuration` entries, D-20). A
 * parameter of {@link analyzeArchitectureWith}, so that the stage wiring is tested on its own. Both
 * functions must be deterministic, and must not mutate their inputs, for the document to be deterministic
 * and the structural sections unchanged. References: plan 2.3, 3.2.
 */
export interface InferenceStage {
  readonly inferArchitecture: (input: InferenceInput) => InferenceResult;
  readonly withRoles: (
    files: readonly FileEntity[],
    roles: ReadonlyMap<FileId, readonly RoleEntry[]>,
  ) => FileEntity[];
}

/** The configuration sections inference reads, as validated by `INFERENCE_CONFIGURATION_SECTIONS`. */
interface InferenceSections {
  readonly modules?: ModulesConfiguration;
  readonly layers?: LayersConfiguration;
  readonly inference?: InferenceConfiguration;
}

/** The inference stage of `@katedrala/inference` (plan 3.2). */
const INFERENCE_STAGE: InferenceStage = { inferArchitecture, withRoles };

/**
 * Analyze a repository's architecture: run {@link analyzeStructure}, then the inference stage, which derives
 * components [DERIVED] and infers architectural roles, modules and layers [KATEDRALA HEURISTIC], each inferred
 * conclusion with confidence, evidence and a method string (see docs/ALGORITHMS.md).
 *
 * 1. The structure is analyzed with the validators of the `modules`, `layers` and `inference` sections
 *    registered (`INFERENCE_CONFIGURATION_SECTIONS`, D-59), so invalid inference configuration is a
 *    `ConfigurationError`, and those sections get no "not evaluated" warning. The validators inject no
 *    defaults (D-61), so `snapshot.analysisDigest` equals `analyzeStructure`'s for the same input.
 * 2. The `inference` stage (timed into `run.timings.inference`, reported through `onProgress`) resolves the
 *    settings (`resolveInferenceSettings`, with `analysis.include_tests_in_metrics`, D-65) and the
 *    declarations (`resolveDeclarations`), runs inference on the structure's model with the metrics
 *    projection (`metricsProjectionOptions`), merges the inferred roles into `files` and the inference
 *    diagnostics into `diagnostics`, and assembles the document. Earlier sections are never mutated.
 * 3. A model over the final document is built (D-60).
 *
 * The document is canonical as produced. Determinism: the same inputs give byte-identical documents;
 * configuration key order carries no meaning (D-23). Complexity: that of the structure analysis plus
 * inference (docs/ALGORITHMS.md, "Complexity and scale") plus one model build, linear in the document size.
 * References: plan 2.3, 3.4; docs/ARCHITECTURE.md, "The analysis pipeline".
 *
 * @throws {TypeError} when `options.configurationSections` registers `modules`, `layers` or `inference`,
 *   which this function registers itself.
 * @throws {ConfigurationError} (from `@katedrala/core`) when the configuration is invalid.
 */
export function analyzeArchitecture(options: AnalyzeOptions = {}): Promise<ArchitectureAnalysis> {
  return analyzeArchitectureWith(INFERENCE_STAGE, options);
}

/**
 * {@link analyzeArchitecture} with the functions of the inference stage given as a parameter [DERIVED:
 * orchestration only]. Internal to the engine (not exported from the package): it lets tests drive the stage
 * wiring with stand-in functions. Determinism, complexity and errors: as {@link analyzeArchitecture}, given
 * deterministic stage functions. References: plan 2.3.
 */
export async function analyzeArchitectureWith(
  stage: InferenceStage,
  options: AnalyzeOptions = {},
): Promise<ArchitectureAnalysis> {
  const start = performance.now();
  const callerSections = options.configurationSections ?? {};
  for (const section of Object.keys(INFERENCE_CONFIGURATION_SECTIONS)) {
    // As core protects its own sections (createConfigurationSchema): the inference sections are the engine's.
    if (Object.hasOwn(callerSections, section)) {
      throw new TypeError(
        `Configuration section "${section}" is registered by analyzeArchitecture (@katedrala/engine)`,
      );
    }
  }
  // D-59: the engine validates the inference sections; D-61: the validators inject no defaults, so the
  // canonical configuration JSON, and the analysis digest computed from it, equal analyzeStructure's.
  const structure = await analyzeStructure({
    ...options,
    configurationSections: { ...INFERENCE_CONFIGURATION_SECTIONS, ...callerSections },
  });

  options.signal?.throwIfAborted();
  options.onProgress?.({ stage: "inference" });
  const stageStart = performance.now();
  const { configuration, settings } = structure;
  // Validated by INFERENCE_CONFIGURATION_SECTIONS, registered above.
  const sections = configuration.config as InferenceSections;
  // D-65: the attachment policy follows the same core setting as the metrics projection's file roles.
  const inference = resolveInferenceSettings(sections.inference, {
    includeTestsInMetrics: settings.includeTestsInMetrics,
  });
  const projection = metricsProjectionOptions(settings);
  const declarations = resolveDeclarations(
    structure.document.files,
    sections,
    configurationFileOf(configuration),
  );
  const result = stage.inferArchitecture({
    model: structure.model,
    settings: inference,
    declarations,
    projection,
    repositoryName: structure.document.repository.name,
  });
  const document = assemble(structure.document, result, stage.withRoles);
  const timings = {
    ...structure.run.timings,
    inference: Math.round(performance.now() - stageStart),
  };
  const run: RunInfo = {
    ...structure.run,
    durationMs: Math.round(performance.now() - start),
    timings,
  };

  return {
    document,
    // D-60: the third model build (after the structure model and inference's units model), over the final
    // document, so that the model stays a view of its document.
    model: ArchitectureModel.from(document),
    run,
    configuration,
    settings,
    inference,
    projection: toProjectionInfo(projection),
  };
}

/**
 * The configuration file when it is a file of the snapshot, where configuration warnings are located (as
 * for the structure's own configuration warnings). A configuration the caller supplied is not part of the
 * snapshot, and its location on the analyzing machine never appears in the document.
 */
function configurationFileOf(configuration: SnapshotConfiguration): FileId | undefined {
  return configuration.inSnapshot && configuration.path !== undefined
    ? fileId(configuration.path)
    : undefined;
}

/**
 * The final document, copy-on-write: the structural sections in their order, `files` with the inferred roles
 * merged, then the architectural sections (in IR order), and every diagnostic in canonical order.
 */
function assemble(
  structure: StructureDocument,
  result: InferenceResult,
  withRoles: InferenceStage["withRoles"],
): ArchitectureSections {
  const { diagnostics, ...sections } = structure;
  return {
    ...sections,
    files: withRoles(structure.files, result.roles),
    components: result.components,
    modules: result.modules,
    layers: result.layers,
    diagnostics: sortDiagnostics([...diagnostics, ...result.diagnostics]),
  };
}
