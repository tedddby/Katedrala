/** Facts about the project used across the page. Every link and claim lives here, in one place. */

export const REPOSITORY_URL = "https://github.com/tedddby/Katedrala";

export const LINKS = {
  repository: REPOSITORY_URL,
  readme: `${REPOSITORY_URL}#readme`,
  documentation: `${REPOSITORY_URL}/tree/main/docs`,
  architecture: `${REPOSITORY_URL}/blob/main/docs/ARCHITECTURE.md`,
  ir: `${REPOSITORY_URL}/blob/main/docs/IR.md`,
  roadmap: `${REPOSITORY_URL}/blob/main/docs/ROADMAP.md`,
  contributing: `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`,
  license: `${REPOSITORY_URL}/blob/main/LICENSE`,
  codeverse: "https://codeverse.awab.tech",
  codeverseRepository: "https://github.com/tedddby/CodeVerse",
} as const;

/** What ships today, what is planned for v1, and what comes after it. Shown wherever a capability appears. */
export type Status = "available" | "planned" | "after-v1";

export const STATUS_LABEL: Record<Status, string> = {
  available: "Available today",
  planned: "Planned for v1",
  "after-v1": "Planned after v1",
};

export type MilestoneState = "done" | "in-progress" | "planned";

/** The v1 milestones, as docs/ROADMAP.md lists them. Update both together. */
export const MILESTONES: readonly { readonly name: string; readonly state: MilestoneState }[] = [
  { name: "Foundation, architecture, IR", state: "done" },
  { name: "TypeScript/JavaScript parsing", state: "done" },
  { name: "Dependency graph", state: "done" },
  { name: "Graph algorithms", state: "done" },
  { name: "Architectural inference", state: "planned" },
  { name: "Metrics", state: "planned" },
  { name: "Anomaly detection", state: "planned" },
  { name: "Rules engine", state: "planned" },
  { name: "Impact analysis", state: "planned" },
  { name: "Architecture diff", state: "planned" },
  { name: "CLI", state: "planned" },
  { name: "Git and CI integration", state: "planned" },
  { name: "Performance and caching", state: "in-progress" },
  { name: "CodeVerse adapter", state: "planned" },
  { name: "Documentation and release preparation", state: "planned" },
];

export const MILESTONE_LABEL: Record<MilestoneState, string> = {
  done: "Done",
  "in-progress": "In progress",
  planned: "Planned",
};

/**
 * Real output: Katedrala's structure analysis of CodeVerse (github.com/tedddby/CodeVerse, commit 6b942bc),
 * produced by `analyzeStructure` on the working tree. Two runs produced byte-identical documents.
 */
export const CODEVERSE_ANALYSIS = {
  repository: "tedddby/CodeVerse",
  commit: "6b942bc",
  files: 644,
  analyzedFiles: 594,
  symbols: 3766,
  relationships: 14233,
  /** External entities: 39 npm packages, 8 Node.js built-ins and 12 environment variables. */
  externals: 59,
  packages: 39,
  builtins: 8,
  environmentVariables: 12,
  directories: 84,
  unresolvedImports: 0,
} as const;

/**
 * One relationship, verbatim, from Katedrala's document for CodeVerse (commit 6b942bc, Katedrala 0.1.0,
 * IR schema 1.0.0): every observation carries the file, line, column, mechanism and how it was resolved.
 */
export const REAL_EDGE = {
  id: "edge:68b8718fedaa1a19",
  kind: "calls",
  source: "sym:src/analysis/analysis-service.ts#createAnalysisService",
  target: "sym:src/analysis/cache-key.ts#graphCacheKey",
  observations: 2,
  typeOnly: false,
  confidence: 1,
  provenance: [
    {
      file: "file:src/analysis/analysis-service.ts",
      line: 219,
      column: 17,
      mechanism: "call-expression",
      resolution: "import-binding",
      confidence: 1,
    },
    {
      file: "file:src/analysis/analysis-service.ts",
      line: 273,
      column: 19,
      mechanism: "call-expression",
      resolution: "import-binding",
      confidence: 1,
    },
  ],
} as const;
