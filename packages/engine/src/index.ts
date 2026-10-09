/**
 * Katedrala analysis engine: runs the analysis pipeline from a repository snapshot to an architecture
 * document.
 */
export {
  ANALYSIS_STAGES,
  analyzeStructure,
  type AnalysisProgress,
  type AnalysisStage,
  type AnalyzeOptions,
  type StructureAnalysis,
  type StructureDocument,
} from "./structure.js";
export {
  analyzeArchitecture,
  type ArchitectureAnalysis,
  type ArchitectureSections,
} from "./architecture.js";
export { INFERENCE_CONFIGURATION_SECTIONS } from "./inference-configuration.js";
export { resolveDeclarations } from "./declarations.js";
export { metricsProjectionOptions } from "./projection.js";
export {
  loadSnapshotConfiguration,
  type ConfigurationRequest,
  type SnapshotConfiguration,
} from "./configuration.js";
export {
  analysisDigest,
  contentDigest,
  repositoryIdentity,
  type DigestedFile,
  type RepositoryIdentity,
  type RepositoryIdentityInput,
} from "./identity.js";
export { KATEDRALA_VERSION } from "./version.js";
