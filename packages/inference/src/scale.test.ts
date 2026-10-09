/**
 * Scale test of the inference pipeline (plan 7.5; design §9.4). A seeded generator builds a repository of N
 * files (N a multiple of 800) in directories of 160 files:
 *
 * - 80 % in flat feature directories `src/features/fNNN` (oversized and without subdirectories, so P1 keeps
 *   each as one unit and P4 splits it);
 * - 20 % in layer-organized groups `src/apps/aNNN/{controllers,services,repositories,models}` of 40 files per
 *   layer directory. A group holds 160 files, more than `max_module_files`, so P1 splits it and P2 runs on
 *   it. 60 % of a group's files carry 24 recurring stems (`s0000`, ...), one file per layer directory each,
 *   chained by edges (controller → service → repository → model); the others have unique stems;
 * - 10 · N file-to-file `imports` edges, 10 % type-only. Group files carry only their chain edges and edges
 *   among the non-stem files of their own layer directory; feature files carry the rest, 80 % inside their
 *   directory and 20 % to other feature directories. `detail.symbols` is false and there is no provenance.
 *
 * The default size (N = 12 000: 60 feature directories, 15 groups, 120 000 edges) always runs and asserts the
 * partition invariants, unique ids, identical output over two runs and, per group, that every recurring stem
 * is the stem module `mod:<group>#<stem>` with exactly its files while every other file stays in its
 * layer-directory module. No timing is asserted (the graph package's convention). `KATEDRALA_SCALE=1` runs
 * the same assertions at N = 48 000 and the design's target N = 100 000 (10^6 edges) and reports wall time
 * and heap growth without asserting them (review #35); the values are machine-dependent and go to ROADMAP's
 * milestone 13 notes.
 */
import { createRandom, type RandomSource } from "@katedrala/graph";
import { compareStrings, fileId, serializeDocument, type FileId } from "@katedrala/ir";
import { ArchitectureModel, DEFAULT_EDGE_KINDS, DEFAULT_FILE_ROLES } from "@katedrala/model";
import { describe, expect, it } from "vitest";
import { inferArchitecture } from "./infer.js";
import { resolveInferenceSettings } from "./settings.js";
import { syntheticDocument, type SyntheticEdgeSpec } from "./test-support.js";
import type { InferenceResult } from "./types.js";

const FULL = process.env.KATEDRALA_SCALE === "1";
const DIRECTORY_FILES = 160;
const STEMS_PER_GROUP = 24;
/** Layer directories of a group, with the naming qualifier of their files and a prefix for unique stems. */
const LAYERS = [
  { directory: "controllers", qualifier: ".controller", unique: "c" },
  { directory: "services", qualifier: ".service", unique: "v" },
  { directory: "repositories", qualifier: ".repository", unique: "p" },
  { directory: "models", qualifier: "", unique: "m" },
] as const;
const UNIQUE_PER_LAYER = DIRECTORY_FILES / LAYERS.length - STEMS_PER_GROUP;

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

interface Group {
  readonly directory: string;
  /** Per stem: its files, one per layer directory, in layer order. */
  readonly stems: ReadonlyMap<string, readonly string[]>;
  /** Per layer directory: the files with unique stems. */
  readonly others: ReadonlyMap<string, readonly string[]>;
}

interface ScaleRepository {
  readonly model: ArchitectureModel;
  readonly groups: readonly Group[];
  readonly files: number;
  readonly edges: number;
}

/** A distinct, non-reflexive edge set built by drawing until the target count is reached. */
class EdgeSet {
  readonly #keys = new Set<string>();
  readonly edges: SyntheticEdgeSpec[] = [];
  constructor(readonly random: RandomSource) {}

  add(source: string, target: string): boolean {
    if (source === target) return false;
    const key = `${source}\n${target}`;
    if (this.#keys.has(key)) return false;
    this.#keys.add(key);
    // Plan 7.5: 10 % of the edges are type-only.
    this.edges.push({ source, target, typeOnly: this.random() < 0.1 });
    return true;
  }
}

const pick = <T>(items: readonly T[], random: RandomSource): T =>
  items[Math.floor(random() * items.length)]!;

/** The repository of plan 7.5 with N files, generated from `seed`. */
function scaleRepository(n: number, seed: number): ScaleRepository {
  if (n % 800 !== 0) throw new RangeError(`N must be a multiple of 800 (got ${n})`);
  const random = createRandom(seed);
  const files: string[] = [];
  const edges = new EdgeSet(random);

  // 20 %: layer-organized groups.
  const groups: Group[] = [];
  for (let g = 0; g < n / 800; g++) {
    const directory = `src/apps/a${pad(g, 3)}`;
    const stems = new Map<string, string[]>();
    const others = new Map<string, string[]>();
    for (let s = 0; s < STEMS_PER_GROUP; s++) {
      const stem = `s${pad(s, 4)}`;
      const chain = LAYERS.map(
        (layer) => `${directory}/${layer.directory}/${stem}${layer.qualifier}.ts`,
      );
      stems.set(stem, chain);
      files.push(...chain);
      // The chain: controller → service → repository → model.
      for (let i = 1; i < chain.length; i++) edges.add(chain[i - 1]!, chain[i]!);
    }
    for (const layer of LAYERS) {
      const own = Array.from(
        { length: UNIQUE_PER_LAYER },
        (_, i) =>
          `${directory}/${layer.directory}/${layer.unique}${pad(i, 4)}${layer.qualifier}.ts`,
      );
      others.set(layer.directory, own);
      files.push(...own);
      // Edges among the non-stem files of the layer directory only: a ring and one random chord each.
      own.forEach((file, i) => {
        edges.add(file, own[(i + 1) % own.length]!);
        edges.add(file, pick(own, random));
      });
    }
    groups.push({ directory, stems, others });
  }

  // 80 %: flat feature directories, which carry the remaining edges.
  const features: string[][] = [];
  for (let f = 0; f < n / 200; f++) {
    const directory = `src/features/f${pad(f, 3)}`;
    const own = Array.from(
      { length: DIRECTORY_FILES },
      (_, i) => `${directory}/w${pad(f * DIRECTORY_FILES + i, 6)}.ts`,
    );
    features.push(own);
    files.push(...own);
  }
  const target = 10 * n;
  while (edges.edges.length < target) {
    const home = pick(features, random);
    const source = pick(home, random);
    const destination = random() < 0.8 ? home : pick(features, random);
    edges.add(source, pick(destination, random));
  }

  const document = syntheticDocument({
    repositoryName: "scale",
    files,
    edges: edges.edges,
    detail: { symbols: false },
  });
  return { model: ArchitectureModel.from(document), groups, files: files.length, edges: target };
}

function infer(model: ArchitectureModel): InferenceResult {
  return inferArchitecture({
    model,
    settings: resolveInferenceSettings(),
    declarations: { modules: [], roles: [] },
    projection: {
      edgeKinds: new Set(DEFAULT_EDGE_KINDS),
      includeTypeOnly: true,
      fileRoles: new Set(DEFAULT_FILE_ROLES),
    },
    repositoryName: "scale",
  });
}

/** The sections of a result as text, for the determinism check. */
const serialized = (result: InferenceResult): string =>
  serializeDocument({
    components: result.components,
    modules: result.modules,
    layers: result.layers,
    roles: [...result.roles],
  });

/** Plan 7.5's assertions on one repository. */
function check(repository: ScaleRepository, result: InferenceResult): void {
  const { model, groups } = repository;
  const sources = model.document.files.map((file) => file.id);

  // Partition invariants: every node in exactly one module, ids unique; components partition the files.
  const moduleOf = new Map<FileId, string>();
  for (const module of result.modules) {
    for (const file of module.files) {
      expect(moduleOf.has(file)).toBe(false);
      moduleOf.set(file, module.id);
    }
  }
  expect(moduleOf.size).toBe(sources.length);
  expect(new Set(result.modules.map((module) => module.id)).size).toBe(result.modules.length);
  const owned = result.components.flatMap((component) => component.files).sort(compareStrings);
  expect(owned).toEqual(sources);
  const layered = result.layers.flatMap((layer) => layer.files);
  expect(new Set(layered).size).toBe(layered.length);

  // Review #35: per group, the recurring stems are stem modules with exactly their files, and every other
  // file stays in its layer-directory module.
  const members = new Map(result.modules.map((module) => [module.id, module.files]));
  for (const group of groups) {
    for (const [stem, chain] of group.stems) {
      expect(members.get(`mod:${group.directory}#${stem}`)).toEqual(
        chain.map((path) => fileId(path)).sort(compareStrings),
      );
    }
    for (const [directory, own] of group.others) {
      const id = `mod:${group.directory}/${directory}`;
      for (const path of own) expect(moduleOf.get(fileId(path))).toBe(id);
    }
  }
}

describe("inference at scale (plan 7.5)", () => {
  it("keeps every invariant at N = 12 000 (60 feature directories, 15 groups, 120 000 edges)", () => {
    const repository = scaleRepository(12_000, 7_005);
    expect(repository.model.document.edges).toHaveLength(120_000);
    const first = infer(repository.model);
    check(repository, first);
    // Identical output over two runs, on a model rebuilt from a regenerated document.
    const again = infer(scaleRepository(12_000, 7_005).model);
    expect(serialized(again)).toBe(serialized(first));
  }, 600_000);

  it.runIf(FULL)(
    "keeps every invariant at N = 48 000 and 100 000 and reports time and heap (KATEDRALA_SCALE=1)",
    async (context) => {
      const rows: string[] = [];
      for (const n of [48_000, 100_000]) {
        const before = process.memoryUsage().heapUsed;
        const generated = performance.now();
        const repository = scaleRepository(n, 7_005);
        const built = performance.now();
        const result = infer(repository.model);
        const inferred = performance.now();
        const heap = process.memoryUsage().heapUsed;
        check(repository, result);
        rows.push(
          `| ${n} | ${repository.edges} | ${((built - generated) / 1000).toFixed(1)} s | ` +
            `${((inferred - built) / 1000).toFixed(1)} s | ${((heap - before) / 2 ** 20).toFixed(0)} MiB | ` +
            `${(heap / 2 ** 20).toFixed(0)} MiB |`,
        );
      }
      const report = [
        "",
        "| files | edges | generation and model | inferArchitecture | heap growth | heap used |",
        "| --- | --- | --- | --- | --- | --- |",
        ...rows,
        "",
      ].join("\n");
      await context.annotate(report);
      process.stdout.write(report);
    },
    3_600_000,
  );
});
