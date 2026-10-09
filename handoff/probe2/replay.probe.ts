// Linker-graph replay of the M5 plan (P0-P3, P5, P7, P9, roles, layers) on analyzeStructure output.
// Scratch investigation only; mirrors the revised plan's rules, not production code.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { InMemorySource } from "@katedrala/core";
import { analyzeStructure } from "@katedrala/engine";

const FIXTURES = "C:/Users/Awab/Desktop/PROJECTS/Katedrala/fixtures";
const OUT =
  `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/probe2/replay${process.env.PRIOR_SIZE === "1" ? ".prior" : ""}.out.txt`;

function fixtureSource(name: string): InMemorySource {
  const files: Record<string, Uint8Array> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(directory, entry.name), path);
      else if (prefix !== "" || (entry.name !== "README.md" && entry.name !== "expected.json")) {
        files[path] = readFileSync(join(directory, entry.name));
      }
    }
  };
  walk(join(FIXTURES, name), "");
  return new InMemorySource({ files });
}

// ─── vocabularies (plan 4.1.3) ───────────────────────────────────────────────
const CONTAINERS = new Set(
  "app apps cmd domains feature features internal libs module modules packages pkg source sources src".split(" "),
);
const SHARED = new Set(
  "base common config configuration constant core helper interface kernel lib misc setting shared support tool type util utility".split(
    " ",
  ),
);
const DIR_LAYERS = new Map<string, string>();
for (const [keys, layer] of [
  ["controller", "controller"],
  ["route router routing", "route"],
  ["handler", "handler"],
  ["resolver", "resolver"],
  ["middleware guard interceptor", "middleware"],
  ["view", "view"],
  ["page screen", "page"],
  ["component", "component"],
  ["presentation ui web http", "presentation"],
  ["api rest graphql endpoint", "api"],
  ["service", "service"],
  ["usecase use-case use_case interactor application", "application"],
  ["domain", "domain"],
  ["model entity", "model"],
  ["schema", "schema"],
  ["dto", "dto"],
  ["repository repo dao persistence", "repository"],
  ["db database", "database"],
  ["data", "data"],
  ["storage", "storage"],
  ["store", "store"],
  ["client", "client"],
  ["gateway", "gateway"],
  ["integration", "integration"],
  ["adapter", "adapter"],
  ["port", "port"],
  ["infrastructure infra", "infrastructure"],
  ["job worker task cron", "job"],
  ["hook", "hook"],
  ["listener subscriber consumer", "listener"],
  ["command cli", "command"],
] as const) {
  for (const key of keys.split(" ")) DIR_LAYERS.set(key, layer);
}
const SUFFIX_ROLE = new Map<string, string>();
for (const [keys, role] of [
  ["controller", "http-controller"],
  ["route router", "route-definition"],
  ["middleware guard interceptor", "middleware"],
  ["service", "service"],
  ["repository repo", "repository"],
  ["entity model", "data-model"],
  ["dto", "data-transfer-object"],
  ["client", "external-client"],
  ["module", "module-definition"],
  ["store", "state-store"],
  ["page", "ui-page"],
  ["component", "ui-component"],
] as const) {
  for (const key of keys.split(" ")) SUFFIX_ROLE.set(key, role);
}
const ROLE_LAYER = new Map<string, string | null>([
  ["http-controller", "controller"],
  ["route-definition", "route"],
  ["middleware", "middleware"],
  ["service", "service"],
  ["repository", "repository"],
  ["data-model", "model"],
  ["data-transfer-object", "dto"],
  ["external-client", "client"],
  ["ui-page", "page"],
  ["ui-component", "component"],
  ["state-store", "store"],
  ["module-definition", null],
  ["configuration-provider", null],
  ["utility", null],
]);
// unique inverse (D-18)
const LOCATION_ROLE = new Map<string, string>();
{
  const counts = new Map<string, string[]>();
  for (const [role, layer] of ROLE_LAYER) if (layer !== null) counts.set(layer, [...(counts.get(layer) ?? []), role]);
  for (const [layer, roles] of counts) if (roles.length === 1) LOCATION_ROLE.set(layer, roles[0]!);
}
const GENERIC = new Set(
  "abstract action adapter app base bootstrap client command common component config constant consumer container context controller core default dto effect entity enum error event exception factory filter fixture guard handler helper hook index init interceptor interface job listener log logger main mapper message middleware mock mod model module option page pipe provider query reducer repo repository request resolver response result route router saga schema selector server service setting setup shared slice spec store story style subscriber test type util validator view worker".split(
    " ",
  ),
);
const NON_STEM = new Set([...GENERIC, ...SUFFIX_ROLE.keys()]);
const TIER = new Map<string, number>();
for (const [tier, names] of [
  [0, "route page"],
  [1, "controller handler resolver view api presentation middleware job listener command"],
  [2, "component service application hook store"],
  [3, "domain repository gateway client"],
  [4, "database storage data model dto schema"],
] as const) {
  for (const n of names.split(" ")) TIER.set(n, tier);
}

// ─── lexical ─────────────────────────────────────────────────────────────────
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
function sStem(w: string): string {
  if (w.endsWith("ies") && !w.endsWith("eies") && !w.endsWith("aies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses") || w.endsWith("xes") || w.endsWith("shes") || w.endsWith("zzes")) return w.slice(0, -2);
  if (w.endsWith("es") && !w.endsWith("aes") && !w.endsWith("ees") && !w.endsWith("oes")) return w.slice(0, -1);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) return w.slice(0, -1);
  return w;
}
function tokens(text: string): { text: string; key: string }[] {
  const out: { text: string; key: string }[] = [];
  for (const part of text.split(/[^A-Za-z0-9\u0080-\uffff]+/)) {
    if (part === "") continue;
    const pieces = part
      .replace(/([a-z0-9])([A-Z])/g, "$1\u0000$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1\u0000$2")
      .split("\u0000");
    for (const piece of pieces) if (piece !== "") out.push({ text: piece, key: asciiLower(piece) });
  }
  return out;
}
const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const isWithin = (p: string, d: string): boolean => d === "" || p === d || p.startsWith(`${d}/`);
function nameParts(fileName: string): { head: string; qualifiers: string[] } {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const parts = base.split(".");
  return { head: parts[0] ?? "", qualifiers: parts.slice(1).map(asciiLower) };
}
function fileStem(path: string): { stem: string; original: string } | undefined {
  const t = tokens(nameParts(baseName(path)).head)[0];
  if (t === undefined) return undefined;
  const key = sStem(t.key);
  if (NON_STEM.has(key) || key.length < 2) return undefined;
  return { stem: key, original: t.text };
}
type DirKind = "container" | "layer" | "shared" | "feature";
function dirKind(name: string): DirKind {
  const lower = asciiLower(name);
  if (CONTAINERS.has(lower)) return "container";
  const st = sStem(lower);
  if (DIR_LAYERS.has(st)) return "layer";
  if (SHARED.has(st)) return "shared";
  return "feature";
}
const keyOf = (dir: string, stem?: string): string => {
  const d = dir === "" ? "." : dir;
  return stem === undefined ? d : `${d}#${stem}`;
};

// ─── weighted file graph ─────────────────────────────────────────────────────
interface WG {
  nodes: string[];
  index: Map<string, number>;
  out: Map<number, number>[];
  inn: Map<number, number>[];
  admittedOut: number[];
  reexportOut: number[];
  kinds: Map<string, Set<string>>; // "u v" -> kinds of admitted edges
  typeOnlyPair: Set<string>;
}
function buildWG(model: any, roles: string[], exclude: Set<string>): WG {
  const p = model.projection({ level: "file", fileRoles: new Set(roles), includeTypeOnly: true });
  const nodes = (p.nodes as string[]).filter((id) => !exclude.has(id));
  const index = new Map(nodes.map((id, i) => [id, i] as const));
  const out = nodes.map(() => new Map<number, number>());
  const inn = nodes.map(() => new Map<number, number>());
  const admittedOut = nodes.map(() => 0);
  const reexportOut = nodes.map(() => 0);
  const kinds = new Map<string, Set<string>>();
  const typeOnlyPair = new Set<string>();
  for (let u = 0; u < p.nodes.length; u++) {
    const uu = index.get(p.nodes[u]);
    if (uu === undefined) continue;
    for (let i = p.graph.outOffsets[u]; i < p.graph.outOffsets[u + 1]; i++) {
      const vv = index.get(p.nodes[p.graph.outTargets[i]]);
      if (vv === undefined) continue;
      const info = p.edgeInfoAt(i);
      const edges = info.edges.map((id: string) => model.index.edge(id));
      const admitted = edges.filter((e: any) => e.confidence >= 0.5);
      if (admitted.length === 0) continue;
      admittedOut[uu]!++;
      if (admitted.some((e: any) => e.kind === "re-exports")) reexportOut[uu]!++;
      const runtime = admitted.some((e: any) => !e.typeOnly);
      const w = runtime ? 1 : 0.5;
      out[uu]!.set(vv, w);
      inn[vv]!.set(uu, w);
      kinds.set(`${uu} ${vv}`, new Set(admitted.map((e: any) => e.kind)));
      if (!runtime) typeOnlyPair.add(`${uu} ${vv}`);
    }
  }
  return { nodes, index, out, inn, admittedOut, reexportOut, kinds, typeOnlyPair };
}

// ─── modules ─────────────────────────────────────────────────────────────────
type UnitKind = "root" | "feature" | "layer" | "shared" | "stem" | "split";
interface Unit {
  key: string;
  dir: string;
  stem?: string;
  kind: UnitKind;
  members: Set<string>;
  prior: Set<string>;
  dest: boolean;
  group?: string;
}

function inferScope(
  lines: string[],
  wg: WG,
  scopeDir: string,
  scopeNodes: string[],
  entryFiles: Set<string>,
): { units: Unit[]; unitOf: Map<string, Unit>; orch: Set<string>; util: Set<string>; facades: Set<string>; relocations: string[]; sourceRoot: string } {
  const paths = scopeNodes.map((id) => id.slice(5));
  const direct = new Map<string, string[]>();
  const subtree = new Map<string, number>();
  const children = new Map<string, Set<string>>();
  for (const f of paths) {
    let d = dirOf(f);
    if (!direct.has(d)) direct.set(d, []);
    direct.get(d)!.push(f);
    subtree.set(d, (subtree.get(d) ?? 0) + 1);
    while (d !== "") {
      const parent = dirOf(d);
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent)!.add(d);
      subtree.set(parent, (subtree.get(parent) ?? 0) + 1);
      d = parent;
    }
  }
  let r = scopeDir;
  while ((direct.get(r)?.length ?? 0) === 0 && (children.get(r)?.size ?? 0) === 1) r = [...children.get(r)!][0]!;
  const units: Unit[] = [];
  const splitDirs: string[] = [];
  const subtreeFiles = (d: string): string[] => paths.filter((f) => isWithin(dirOf(f), d));
  const descend = (d: string, isRoot: boolean): void => {
    const kind = dirKind(baseName(d));
    const split = isRoot || kind === "container" || ((subtree.get(d) ?? 0) > 120 && (children.get(d)?.size ?? 0) > 0);
    if (!split) {
      const k = kind as "feature" | "layer" | "shared";
      const fs = subtreeFiles(d);
      if (fs.length > 0) units.push({ key: keyOf(d), dir: d, kind: k, members: new Set(fs), prior: new Set(fs), dest: k === "feature" });
      return;
    }
    splitDirs.push(d);
    const own = direct.get(d) ?? [];
    if (own.length > 0) {
      const k: UnitKind = isRoot ? "root" : kind === "container" ? "shared" : (kind as UnitKind);
      units.push({ key: keyOf(d), dir: d, kind: k, members: new Set(own), prior: new Set(own), dest: k === "feature" });
    }
    for (const c of [...(children.get(d) ?? [])].sort(cmp)) descend(c, false);
  };
  descend(r, true);
  lines.push(`  scope ${JSON.stringify(scopeDir)} source root ${JSON.stringify(r)}; split dirs ${JSON.stringify(splitDirs)}`);

  const nodeIdx = (p: string): number => wg.index.get(`file:${p}`)!;
  // P2
  for (const d of splitDirs) {
    const kids = [...(children.get(d) ?? [])].sort(cmp);
    const L = kids.filter((c) => dirKind(baseName(c)) === "layer");
    const F = kids.filter((c) => dirKind(baseName(c)) === "feature");
    const S = kids.filter((c) => dirKind(baseName(c)) === "shared");
    let style = L.length >= 2 ? (F.length >= 1 ? "mixed" : "layer") : F.length >= 1 ? "feature" : "none";
    if (L.length < 2) {
      lines.push(`  P2 ${d}: L=${L.map(baseName)} F=${F.map(baseName)} S=${S.map(baseName)} style=${style}`);
      continue;
    }
    const below = paths.filter((f) => L.some((c) => isWithin(f, c) && f !== c));
    const layerOf = (f: string): string => L.find((c) => isWithin(f, c))!;
    // sub-directory stems
    const subOcc = new Map<string, Set<string>>();
    for (const f of below) {
      const c = layerOf(f);
      if (dirOf(f) !== c) {
        const s = f.slice(c.length + 1).split("/")[0]!;
        const key = sStem(asciiLower(s));
        if (!subOcc.has(key)) subOcc.set(key, new Set());
        subOcc.get(key)!.add(c);
      }
    }
    const stemOf = new Map<string, string>();
    for (const f of below) {
      const c = layerOf(f);
      if (dirOf(f) !== c) {
        const s = sStem(asciiLower(f.slice(c.length + 1).split("/")[0]!));
        if ((subOcc.get(s)?.size ?? 0) >= 2 && !GENERIC.has(s)) {
          stemOf.set(f, s);
          continue;
        }
      }
      const st = fileStem(f);
      if (st !== undefined) stemOf.set(f, st.stem);
    }
    // union-find
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let y = x;
      while (parent.get(y) !== y) y = parent.get(y)!;
      return y;
    };
    for (const f of stemOf.keys()) parent.set(f, f);
    for (const f of stemOf.keys()) {
      const u = nodeIdx(f);
      for (const v of wg.out[u]!.keys()) {
        const g = wg.nodes[v]!.slice(5);
        if (stemOf.get(g) === stemOf.get(f) && stemOf.has(g)) {
          const a = find(f);
          const b = find(g);
          if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
        }
      }
    }
    const comps = new Map<string, string[]>();
    for (const f of stemOf.keys()) {
      const root = find(f);
      if (!comps.has(root)) comps.set(root, []);
      comps.get(root)!.push(f);
    }
    const kept = new Map<string, Set<string>>();
    const dropped: string[] = [];
    for (const comp of comps.values()) {
      const dirs = new Set(comp.map(layerOf));
      const st = stemOf.get(comp[0]!)!;
      if (comp.length >= 2 && dirs.size >= 2) {
        if (!kept.has(st)) kept.set(st, new Set());
        for (const f of comp) kept.get(st)!.add(f);
      } else if (comp.length >= 1 && [...comps.values()].filter((c) => stemOf.get(c[0]!) === st).length > 1) {
        dropped.push(`${st}:${comp.map((x) => x.replace(/^.*\//, "")).join("+")}`);
      }
    }
    const covered = [...kept.values()].reduce((a, s) => a + s.size, 0);
    const coverage = below.length === 0 ? 0 : covered / below.length;
    const applied = kept.size >= 1 && coverage >= 0.25;
    lines.push(
      `  P2 ${d}: L=${L.map(baseName)} F=${F.map(baseName)} S=${S.map(baseName)} style=${style} stems=${[...kept.keys()].sort(cmp)} coverage=${covered}/${below.length}=${coverage.toFixed(3)} applied=${applied}${dropped.length ? ` droppedComponents=${dropped.join(",")}` : ""}`,
    );
    for (const [st, comp] of [...kept.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      if (!applied) break;
      lines.push(`     stem ${st}: ${[...comp].sort(cmp).join(", ")}`);
      for (const u of units) {
        for (const f of comp) {
          u.members.delete(f);
          u.prior.delete(f);
        }
      }
      const target = units.find((u) => F.includes(u.dir) && u.stem === undefined && sStem(asciiLower(baseName(u.dir))) === st);
      if (target !== undefined) {
        for (const f of comp) {
          target.members.add(f);
          target.prior.add(f);
        }
      } else {
        units.push({ key: keyOf(d, st), dir: d, stem: st, kind: "stem", members: new Set(comp), prior: new Set(comp), dest: true, group: d });
      }
    }
  }
  const live = units.filter((u) => u.members.size > 0).sort((a, b) => cmp(a.key, b.key));
  const unitOf = new Map<string, Unit>();
  for (const u of live) for (const f of u.members) unitOf.set(f, u);
  const priorOf = new Map(unitOf);

  // P3
  const inScope = new Set(paths);
  const deps = (f: string): string[] => [...wg.inn[nodeIdx(f)]!.keys()].map((i) => wg.nodes[i]!.slice(5)).filter((g) => inScope.has(g));
  const targets = (f: string): [string, number][] =>
    [...wg.out[nodeIdx(f)]!.entries()].map(([i, w]) => [wg.nodes[i]!.slice(5), w] as [string, number]).filter(([g]) => inScope.has(g));
  const utilitiesOf = (excluded: Set<string>): Set<string> => {
    const found = new Set<string>();
    for (const f of [...paths].sort(cmp)) {
      if (excluded.has(f)) continue;
      const us = new Set(deps(f).filter((s) => !excluded.has(s)).map((s) => priorOf.get(s)!.key));
      us.delete(priorOf.get(f)!.key);
      const k = priorOf.get(f)!.kind;
      const min = k === "shared" || k === "root" ? 2 : 3;
      if (us.size >= min) found.add(f);
    }
    return found;
  };
  const util0 = utilitiesOf(new Set());
  const orch = new Set<string>();
  let changed = true;
  const orchReason = new Map<string, string>();
  while (changed) {
    changed = false;
    for (const f of [...paths].sort(cmp)) {
      if (orch.has(f) || util0.has(f)) continue;
      const ds = deps(f).filter((s) => !orch.has(s));
      if (entryFiles.has(f) && ds.length === 0) {
        orch.add(f);
        orchReason.set(f, "entry");
        changed = true;
        continue;
      }
      if (ds.some((s) => priorOf.get(s)!.key !== priorOf.get(f)!.key)) continue;
      const o = new Map<string, number>();
      for (const [t, w] of targets(f)) if (!util0.has(t)) o.set(priorOf.get(t)!.key, (o.get(priorOf.get(t)!.key) ?? 0) + w);
      const total = [...o.values()].reduce((a, b) => a + b, 0);
      const own = o.get(priorOf.get(f)!.key) ?? 0;
      const others = [...o.keys()].filter((k) => k !== priorOf.get(f)!.key);
      const max = Math.max(0, ...o.values());
      if (total === 0 || others.length < 2 || max > 0.5 * total || own > 0.25 * total) continue;
      orch.add(f);
      orchReason.set(f, `shape ${JSON.stringify(Object.fromEntries(o))}${entryFiles.has(f) ? " (entry point)" : ""}${wg.reexportOut[nodeIdx(f)]! * 2 >= wg.admittedOut[nodeIdx(f)]! && wg.admittedOut[nodeIdx(f)]! > 0 ? " (facade)" : ""}`);
      changed = true;
    }
  }
  const util = utilitiesOf(orch);
  const facades = new Set(paths.filter((f) => wg.admittedOut[nodeIdx(f)]! > 0 && wg.reexportOut[nodeIdx(f)]! * 2 >= wg.admittedOut[nodeIdx(f)]!));
  lines.push(`  P3 orchestrators: ${[...orch].sort(cmp).map((f) => `${f} [${orchReason.get(f)}]`).join("; ")}`);
  lines.push(`  P3 utilities: ${[...util].sort(cmp).join(", ")}${[...util0].filter((x) => !util.has(x)).length ? ` (first pass only: ${[...util0].filter((x) => !util.has(x)).join(", ")})` : ""}`);
  lines.push(`  P3 facades: ${[...facades].sort(cmp).join(", ")}`);
  const pinned = new Set<string>([...orch, ...util, ...facades]);
  for (const f of paths) if (priorOf.get(f)!.kind === "shared") pinned.add(f);
  const excluded = new Set<string>([...orch, ...util]);

  // P5
  const relocations: string[] = [];
  const lastMove = new Map<string, string>();
  let passes = 0;
  for (let pass = 0; pass < 50; pass++) {
    passes++;
    let moved = false;
    for (const f of [...paths].sort(cmp)) {
      if (pinned.has(f)) continue;
      const inW = new Map<string, number>();
      const support = new Map<string, Set<string>>();
      const outW = new Map<string, number>();
      for (const [i, w] of wg.inn[nodeIdx(f)]!) {
        const s = wg.nodes[i]!.slice(5);
        if (!inScope.has(s) || excluded.has(s)) continue;
        const k = unitOf.get(s)!.key;
        inW.set(k, (inW.get(k) ?? 0) + w);
        if (!support.has(k)) support.set(k, new Set());
        support.get(k)!.add(s);
      }
      for (const [t, w] of targets(f)) {
        if (excluded.has(t)) continue;
        const k = unitOf.get(t)!.key;
        outW.set(k, (outW.get(k) ?? 0) + w);
      }
      const totIn = [...inW.values()].reduce((a, b) => a + b, 0);
      const totOut = [...outW.values()].reduce((a, b) => a + b, 0);
      if (totIn === 0) continue;
      const best = [...inW.keys()].sort((a, b) => inW.get(b)! - inW.get(a)! || cmp(a, b))[0]!;
      const P = unitOf.get(f)!;
      const C = live.find((u) => u.key === best)!;
      const priorSize = [...priorOf.values()].filter((u) => u === P).length;
      const minSupport = (process.env.PRIOR_SIZE === "1" ? priorSize : P.members.size) >= 2 ? 2 : 1;
      if (
        C !== P &&
        C.dest &&
        inW.get(best)! > 0.5 * totIn &&
        inW.get(best)! >= 1 &&
        support.get(best)!.size >= minSupport &&
        (totOut === 0 || (outW.get(best) ?? 0) > 0.5 * totOut)
      ) {
        P.members.delete(f);
        C.members.add(f);
        unitOf.set(f, C);
        lastMove.set(f, `in=${JSON.stringify(Object.fromEntries(inW))} out=${JSON.stringify(Object.fromEntries(outW))} support=${support.get(best)!.size}`);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const f of [...paths].sort(cmp)) {
    if (unitOf.get(f) !== priorOf.get(f)) relocations.push(`${f}: ${priorOf.get(f)!.key} -> ${unitOf.get(f)!.key} ${lastMove.get(f)}`);
  }
  lines.push(`  P5 passes=${passes} relocations: ${relocations.length === 0 ? "none" : ""}`);
  for (const r0 of relocations) lines.push(`     ${r0}`);
  return { units: live.filter((u) => u.members.size > 0), unitOf, orch, util, facades, relocations, sourceRoot: r };
}

// ─── run ─────────────────────────────────────────────────────────────────────
it("replay", async () => {
  const out: string[] = [];
  try {
    for (const name of readdirSync(FIXTURES).sort(cmp)) {
      if (!existsSync(join(FIXTURES, name, "expected.json"))) continue;
      const analysis = await analyzeStructure({ source: fixtureSource(name), cache: false, concurrency: 1 });
      const { document, model } = analysis;
      const lines: string[] = [`=== ${name}`];
      const fileById = new Map(document.files.map((f: any) => [f.id, f]));
      const declaredSpecs: [string, string][] =
        name === "dependency-violations" ? [["payments", "src/payments"], ["analytics", "src/analytics"]] : [];
      const declaredOf = new Map<string, string>();
      for (const f of document.files) {
        if (!["source", "test", "declaration", "generated", "script"].includes(f.role)) continue;
        for (const [m, dir] of declaredSpecs) if (isWithin(f.path, dir) && !declaredOf.has(f.path)) declaredOf.set(f.path, `mod:${m}`);
      }
      const exclude = new Set([...declaredOf.keys()].map((p) => `file:${p}`));
      const wg = buildWG(model, ["source"], exclude);
      const entryFiles = new Set<string>();
      for (const e of document.entryPoints) {
        const f = model.fileOf(e.entity);
        if (f !== undefined) entryFiles.add(f.slice(5));
      }
      const pkgPath = new Map(document.packages.map((p: any) => [p.id, p.path]));
      const pkgName = new Map(document.packages.map((p: any) => [p.id, p.name]));
      const scopeOf = (path: string): string => (fileById.get(`file:${path}`) as any)?.package ?? "";
      const scopes = [...new Set(wg.nodes.map((id) => scopeOf(id.slice(5))))].sort(cmp);
      const moduleOf = new Map<string, string>(); // path -> module id
      for (const [p, m] of declaredOf) moduleOf.set(p, m);
      const allUnits: { scope: string; unit: Unit }[] = [];
      const scopeResults = new Map<string, ReturnType<typeof inferScope>>();
      const classes = { orch: new Set<string>(), util: new Set<string>(), facades: new Set<string>() };
      for (const scope of scopes) {
        const scopeNodes = wg.nodes.filter((id) => scopeOf(id.slice(5)) === scope);
        const res = inferScope(lines, wg, scope === "" ? "" : (pkgPath.get(scope) as string), scopeNodes, entryFiles);
        scopeResults.set(scope, res);
        for (const u of res.units) {
          allUnits.push({ scope, unit: u });
          for (const f of u.members) moduleOf.set(f, `mod:${u.key}`);
        }
        res.orch.forEach((x) => classes.orch.add(x));
        res.util.forEach((x) => classes.util.add(x));
        res.facades.forEach((x) => classes.facades.add(x));
      }
      // P7 attachments
      const metricsRoles = new Set(["source", "declaration"]);
      const awg = buildWG(model, ["source", "test", "declaration"], new Set());
      const attached = new Map<string, string>();
      const unitScope = new Map(allUnits.map(({ scope, unit }) => [`mod:${unit.key}`, scope]));
      for (const f of document.files) {
        if (f.role !== "test" && f.role !== "declaration") continue;
        if (declaredOf.has(f.path)) continue;
        const i = awg.index.get(f.id);
        const cands = new Set<string>();
        if (i !== undefined) {
          const neigh = f.role === "test" ? awg.out[i]! : awg.inn[i]!;
          for (const j of neigh.keys()) {
            const g = awg.nodes[j]!.slice(5);
            if (moduleOf.has(g)) cands.add(g);
          }
        }
        const byModule = new Map<string, number>();
        for (const g of cands) byModule.set(moduleOf.get(g)!, (byModule.get(moduleOf.get(g)!) ?? 0) + 1);
        const top = [...byModule.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0];
        const scope = f.package ?? "";
        let verdict: string;
        if (top !== undefined && top[1] * 2 > cands.size) {
          const inferred = unitScope.has(top[0]);
          if (inferred && unitScope.get(top[0]) === scope) {
            attached.set(f.path, top[0]);
            verdict = `majority -> ${top[0]} (${top[1]}/${cands.size})`;
          } else verdict = `majority elsewhere (${top[0]}) -> unassigned`;
        } else if (metricsRoles.has(f.role)) {
          verdict = `no majority ${JSON.stringify(Object.fromEntries(byModule))}; role in metrics projection -> unassigned`;
        } else {
          let found: string | undefined;
          const scopeDir = scope === "" ? "" : (pkgPath.get(scope) as string);
          for (let d = dirOf(f.path); ; d = dirOf(d)) {
            const counts = new Map<string, number>();
            for (const [p, m] of moduleOf) if (dirOf(p) === d && unitScope.get(m) === scope && !declaredOf.has(p)) counts.set(m, (counts.get(m) ?? 0) + 1);
            const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0];
            if (best !== undefined) {
              found = best[0];
              break;
            }
            if (d === scopeDir || d === "") break;
          }
          if (found !== undefined) attached.set(f.path, found);
          verdict = `no majority ${JSON.stringify(Object.fromEntries(byModule))}; location -> ${found ?? "unassigned"}`;
        }
        lines.push(`  P7 ${f.role} ${f.path}: ${verdict}`);
      }
      // P9 confidence per unit
      for (const { scope, unit } of allUnits.sort((a, b) => cmp(a.unit.key, b.unit.key))) {
        const res = scopeResults.get(scope)!;
        const excluded = new Set([...res.orch, ...res.util]);
        const members = [...unit.members];
        const idx = (p: string): number => wg.index.get(`file:${p}`)!;
        const inScope = (p: string): boolean => res.unitOf.has(p);
        let wIn = 0;
        let wCut = 0;
        for (const f of members) {
          if (excluded.has(f)) continue;
          for (const [j, w] of wg.out[idx(f)]!) {
            const g = wg.nodes[j]!.slice(5);
            if (!inScope(g) || excluded.has(g)) continue;
            if (unit.members.has(g)) wIn += w;
            else wCut += w;
          }
          for (const [j, w] of wg.inn[idx(f)]!) {
            const g = wg.nodes[j]!.slice(5);
            if (!inScope(g) || excluded.has(g)) continue;
            if (!unit.members.has(g)) wCut += w;
          }
        }
        const sig: Record<string, number | undefined> = {};
        const n = members.length;
        const inter = members.filter((m) => unit.prior.has(m)).length;
        const union = new Set([...members, ...unit.prior]).size;
        sig["prior-agreement"] = union === 0 ? 1 : inter / union;
        sig["module-size"] = n / (n + 2);
        let weights: Record<string, number>;
        const kind = unit.kind;
        if (kind === "feature" || kind === "stem" || kind === "split") {
          weights = { "internal-edge-ratio": 0.4, "membership-margin": 0.25, "prior-agreement": 0.2, "module-size": 0.15 };
          sig["internal-edge-ratio"] = 2 * wIn + wCut > 0 ? (2 * wIn) / (2 * wIn + wCut) : undefined;
          const margins: number[] = [];
          for (const f of members.sort(cmp)) {
            if (excluded.has(f)) continue;
            for (const dir of ["in", "out"] as const) {
              const acc = new Map<string, number>();
              const neigh = dir === "in" ? wg.inn[idx(f)]! : wg.out[idx(f)]!;
              for (const [j, w] of neigh) {
                const g = wg.nodes[j]!.slice(5);
                if (!inScope(g) || excluded.has(g)) continue;
                const k = res.unitOf.get(g)!.key;
                acc.set(k, (acc.get(k) ?? 0) + w);
              }
              const tot = [...acc.values()].reduce((a, b) => a + b, 0);
              if (tot > 0) {
                const own = (acc.get(unit.key) ?? 0) / tot;
                const alt = Math.max(0, ...[...acc.entries()].filter(([k]) => k !== unit.key).map(([, v]) => v / tot));
                margins.push(Math.max(0, own - alt));
                break;
              }
            }
          }
          sig["membership-margin"] = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : undefined;
        } else if (kind === "layer") {
          weights = { "internal-edge-ratio": 0.5, "prior-agreement": 0.3, "module-size": 0.2 };
          sig["internal-edge-ratio"] = 2 * wIn + wCut > 0 ? (2 * wIn) / (2 * wIn + wCut) : undefined;
        } else if (kind === "shared") {
          weights = { "shared-usage": 0.5, "prior-agreement": 0.3, "module-size": 0.2 };
          let shared = 0;
          for (const f of members) {
            const users = new Set<string>();
            for (const j of wg.inn[idx(f)]!.keys()) {
              const g = wg.nodes[j]!.slice(5);
              if (!inScope(g) || res.orch.has(g)) continue;
              users.add(res.unitOf.get(g)!.key);
            }
            users.delete(unit.key);
            if (users.size >= 2) shared++;
          }
          sig["shared-usage"] = n === 0 ? 0 : shared / n;
        } else {
          weights = { "wiring-share": 0.3, "prior-agreement": 0.5, "module-size": 0.2 };
          sig["wiring-share"] = members.filter((f) => res.orch.has(f) || res.facades.has(f) || entryFiles.has(f)).length / n;
        }
        const conf = Object.entries(weights).reduce((a, [k, w]) => a + w * (sig[k] ?? 0), 0);
        const att = [...attached.entries()].filter(([, m]) => m === `mod:${unit.key}`).map(([p]) => p);
        lines.push(
          `  MODULE mod:${unit.key} kind=${kind} conf=${conf.toFixed(3)} ${Object.entries(sig)
            .map(([k, v]) => `${k}=${v === undefined ? "absent" : v.toFixed(3)}`)
            .join(" ")} members(${n})=${members.sort(cmp).join(", ")}${att.length ? ` attached=${att.join(", ")}` : ""}`,
        );
      }
      // publicApi (imports / re-exports only) for each module
      const publicApi = new Map<string, Set<string>>();
      for (const e of document.edges) {
        if (e.kind !== "imports" && e.kind !== "re-exports") continue;
        const s = model.fileOf(e.source)?.slice(5);
        const t = model.fileOf(e.target)?.slice(5);
        if (s === undefined || t === undefined) continue;
        const sr = (fileById.get(`file:${s}`) as any)?.role;
        const tr = (fileById.get(`file:${t}`) as any)?.role;
        if (!metricsRoles.has(sr) || !metricsRoles.has(tr)) continue;
        const ms = moduleOf.get(s) ?? attached.get(s);
        const mt = moduleOf.get(t);
        if (ms === undefined || mt === undefined || ms === mt) continue;
        if (!publicApi.has(mt)) publicApi.set(mt, new Set());
        publicApi.get(mt)!.add(t);
      }
      for (const [m, s] of [...publicApi.entries()].sort((a, b) => cmp(a[0], b[0]))) lines.push(`  publicApi ${m}: ${[...s].sort(cmp).join(", ")}`);
      // module dependencies (metrics projection: source+declaration, all kinds, type-only included)
      const mdeps = new Set<string>();
      const mwg = buildWG(model, ["source", "declaration"], new Set());
      const modOfAny = (p: string): string | undefined => moduleOf.get(p) ?? attached.get(p);
      for (let u = 0; u < mwg.nodes.length; u++) {
        for (const v of mwg.out[u]!.keys()) {
          const a = modOfAny(mwg.nodes[u]!.slice(5));
          const b = modOfAny(mwg.nodes[v]!.slice(5));
          if (a !== undefined && b !== undefined && a !== b) mdeps.add(`${a} -> ${b}`);
        }
      }
      // note: low-confidence edges are included in aggregation; buildWG drops them (no fixture has any)
      lines.push(`  module dependencies: ${[...mdeps].sort(cmp).join("; ")}`);

      // ─── roles and layers ───
      const sourceFiles = document.files.filter((f: any) => f.role === "source").map((f: any) => f.path).sort(cmp);
      // source root per scope over all source files
      const rootOfScope = new Map<string, string>();
      for (const scope of [...new Set(sourceFiles.map(scopeOf))].sort(cmp)) {
        const ps = sourceFiles.filter((p: string) => scopeOf(p) === scope);
        const direct = new Set(ps.map(dirOf));
        const children = new Map<string, Set<string>>();
        for (const f of ps) {
          let d = dirOf(f);
          while (d !== "") {
            const parent = dirOf(d);
            if (!children.has(parent)) children.set(parent, new Set());
            children.get(parent)!.add(d);
            d = parent;
          }
        }
        let r = scope === "" ? "" : (pkgPath.get(scope) as string);
        while (!direct.has(r) && (children.get(r)?.size ?? 0) === 1) r = [...children.get(r)!][0]!;
        rootOfScope.set(scope, r);
      }
      const classesByFile = new Map<string, string[]>();
      for (const s of document.symbols) {
        if (s.kind === "class" && s.exported && s.parent === undefined) {
          const p = s.file.slice(5);
          classesByFile.set(p, [...(classesByFile.get(p) ?? []), s.name]);
        }
      }
      interface Vote { label: string | null; c: number; source: string; signal: string; role?: string }
      const labelOf = new Map<string, { label: string | null; score: number; votes: Vote[] }>();
      const roleEntries: string[] = [];
      for (const p of sourceFiles) {
        const votes: Vote[] = [];
        const { head, qualifiers } = nameParts(baseName(p));
        for (const q of [...qualifiers].reverse()) {
          const role = SUFFIX_ROLE.get(sStem(q));
          if (role !== undefined) {
            votes.push({ label: ROLE_LAYER.get(role) ?? null, c: 0.8, source: "naming", signal: "name-qualifier", role });
            break;
          }
        }
        const toks = tokens(head);
        if (toks.length >= 2) {
          const role = SUFFIX_ROLE.get(sStem(toks[toks.length - 1]!.key));
          if (role !== undefined) votes.push({ label: ROLE_LAYER.get(role) ?? null, c: 0.6, source: "naming", signal: "name-suffix", role });
        }
        for (const cls of classesByFile.get(p) ?? []) {
          const ct = tokens(cls);
          const role = ct.length >= 2 ? SUFFIX_ROLE.get(sStem(ct[ct.length - 1]!.key)) : undefined;
          if (role !== undefined) votes.push({ label: ROLE_LAYER.get(role) ?? null, c: 0.6, source: "naming", signal: "type-name-suffix", role });
        }
        const r = rootOfScope.get(scopeOf(p))!;
        const rel = r === "" ? p : p.slice(r.length + 1);
        const segs = rel.split("/").slice(0, -1);
        for (const seg of segs) {
          if (dirKind(seg) === "layer") {
            const layer = DIR_LAYERS.get(sStem(asciiLower(seg)))!;
            votes.push({ label: layer, c: 0.7, source: "location", signal: "directory-name", role: LOCATION_ROLE.get(layer) });
            break;
          }
        }
        if (votes.length === 0) continue;
        // roles written
        const perRole = new Map<string, number>();
        for (const v of votes) if (v.role !== undefined) perRole.set(`${v.role}/${v.source}`, Math.max(perRole.get(`${v.role}/${v.source}`) ?? 0, v.c));
        if (perRole.size) roleEntries.push(`${p}: ${[...perRole.entries()].sort((a, b) => cmp(a[0], b[0])).map(([k, c]) => `${k} ${c}`).join(", ")}`);
        // scores
        const labels = new Map<string, Map<string, number>>();
        for (const v of votes) {
          const k = v.label ?? "⊥";
          if (!labels.has(k)) labels.set(k, new Map());
          const m = labels.get(k)!;
          m.set(v.source, Math.max(m.get(v.source) ?? 0, v.c));
        }
        const prec = (s: string): number => (s === "configuration" ? 3 : s === "naming" ? 1 : s === "location" ? 0 : 2);
        const scored = [...labels.entries()].map(([k, m]) => {
          let prod = 1;
          for (const c of m.values()) prod *= 1 - c;
          const strongest = [...m.entries()].sort((a, b) => b[1] - a[1] || prec(b[0]) - prec(a[0]))[0]!;
          return { k, s: 1 - prod, p: prec(strongest[0]) };
        });
        scored.sort((a, b) => b.s - a.s || b.p - a.p || (a.k === "⊥" ? -1 : b.k === "⊥" ? 1 : cmp(a.k, b.k)));
        const win = scored[0]!;
        labelOf.set(p, { label: win.k === "⊥" || win.s < 0.5 ? null : win.k, score: win.s, votes });
      }
      lines.push(`  ROLES ${roleEntries.length} files with roles`);
      for (const r0 of roleEntries) lines.push(`     ${r0}`);
      // pruning
      const members = new Map<string, string[]>();
      for (const [p, l] of labelOf) if (l.label !== null) members.set(l.label, [...(members.get(l.label) ?? []), p]);
      const kept = [...members.keys()]
        .filter((L) => members.get(L)!.length >= 2 || members.get(L)!.some((p) => labelOf.get(p)!.votes.some((v) => v.label === L && v.source !== "naming")))
        .sort(cmp);
      lines.push(`  LABELS ${[...members.entries()].sort((a, b) => cmp(a[0], b[0])).map(([L, ps]) => `${L}(${ps.length})`).join(" ")} kept=${kept.join(",")}`);
      if (kept.length < 2) {
        lines.push("  LAYERS none");
      } else {
        const layerOf = new Map<string, string>();
        for (const L of kept) for (const p of members.get(L)!) layerOf.set(p, L);
        const swg = buildWG(model, ["source"], new Set());
        const W = new Map<string, number>();
        const WT = new Map<string, number>();
        for (let u = 0; u < swg.nodes.length; u++) {
          for (const [v, w] of swg.out[u]!) {
            const a = layerOf.get(swg.nodes[u]!.slice(5));
            const b = layerOf.get(swg.nodes[v]!.slice(5));
            if (a === undefined || b === undefined || a === b) continue;
            W.set(`${a}>${b}`, (W.get(`${a}>${b}`) ?? 0) + w);
            if (swg.typeOnlyPair.has(`${u} ${v}`)) WT.set(`${a}>${b}`, (WT.get(`${a}>${b}`) ?? 0) + w);
          }
        }
        // SCC + exact order (brute force; small)
        const reach = (from: string, arcs: Set<string>): Set<string> => {
          const seen = new Set([from]);
          const stack = [from];
          while (stack.length) {
            const x = stack.pop()!;
            for (const arc of arcs) {
              const [a, b] = arc.split(">") as [string, string];
              if (a === x && !seen.has(b)) {
                seen.add(b);
                stack.push(b);
              }
            }
          }
          return seen;
        };
        const arcs = new Set(W.keys());
        const sccs: string[][] = [];
        const seen = new Set<string>();
        for (const a of kept) {
          if (seen.has(a)) continue;
          const ra = reach(a, arcs);
          const comp = kept.filter((b) => ra.has(b) && reach(b, arcs).has(a));
          comp.forEach((c) => seen.add(c));
          sccs.push(comp);
        }
        const removed = new Set<string>();
        for (const comp of sccs) {
          if (comp.length < 2) continue;
          const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r0) => [x, ...r0])));
          let best: { up: number; inv: number; seq: string[] } | undefined;
          for (const perm of perms([...comp].sort(cmp))) {
            const pos = new Map(perm.map((x, i) => [x, i] as const));
            let up = 0;
            for (const [arc, w] of W) {
              const [a, b] = arc.split(">") as [string, string];
              if (pos.has(a) && pos.has(b) && pos.get(a)! > pos.get(b)!) up += w;
            }
            let inv = 0;
            for (let i = 0; i < perm.length; i++)
              for (let j = i + 1; j < perm.length; j++) {
                const ti = TIER.get(perm[i]!);
                const tj = TIER.get(perm[j]!);
                if (ti !== undefined && tj !== undefined && ti > tj) inv++;
              }
            const better =
              best === undefined || up < best.up || (up === best.up && (inv < best.inv || (inv === best.inv && perm.join(",") < best.seq.join(","))));
            if (better) best = { up, inv, seq: perm };
          }
          const pos = new Map(best!.seq.map((x, i) => [x, i] as const));
          for (const arc of W.keys()) {
            const [a, b] = arc.split(">") as [string, string];
            if (pos.has(a) && pos.has(b) && pos.get(a)! > pos.get(b)!) removed.add(arc);
          }
        }
        const dag = new Set([...W.keys()].filter((a) => !removed.has(a)));
        // conventional arcs: shared package ("" counts as a package)
        const pkgsOf = new Map<string, Set<string>>();
        for (const [p, L] of layerOf) {
          if (!pkgsOf.has(L)) pkgsOf.set(L, new Set());
          pkgsOf.get(L)!.add(scopeOf(p));
        }
        const pairs: [string, string][] = [];
        for (const a of kept)
          for (const b of kept) {
            const ta = TIER.get(a);
            const tb = TIER.get(b);
            if (ta !== undefined && tb !== undefined && ta < tb) pairs.push([a, b]);
          }
        pairs.sort((x, y) => TIER.get(x[0])! - TIER.get(y[0])! || TIER.get(x[1])! - TIER.get(y[1])! || cmp(x[0], y[0]) || cmp(x[1], y[1]));
        const conventional: string[] = [];
        for (const [a, b] of pairs) {
          if (![...pkgsOf.get(a)!].some((s) => pkgsOf.get(b)!.has(s))) continue;
          if (reach(a, dag).has(b) || reach(b, dag).has(a)) continue;
          dag.add(`${a}>${b}`);
          conventional.push(`${a}>${b}`);
        }
        const rank = new Map<string, number>();
        const rk = (x: string): number => {
          if (rank.has(x)) return rank.get(x)!;
          const preds = [...dag].filter((arc) => arc.split(">")[1] === x).map((arc) => arc.split(">")[0]!);
          const v = preds.length === 0 ? 0 : 1 + Math.max(...preds.map(rk));
          rank.set(x, v);
          return v;
        };
        kept.forEach(rk);
        const observed = new Set([...W.keys()].filter((a) => !removed.has(a)));
        lines.push(`  LAYER GRAPH ${[...W.entries()].sort((a, b) => cmp(a[0], b[0])).map(([k, w]) => `${k}=${w}${WT.has(k) ? `(type-only ${WT.get(k)})` : ""}`).join(" ")}`);
        lines.push(`  removed(upward) ${[...removed].join(" ") || "none"}; conventional ${conventional.join(" ") || "none"}`);
        for (const L of [...kept].sort((a, b) => rank.get(a)! - rank.get(b)! || cmp(a, b))) {
          const ms = members.get(L)!;
          const agree = ms.reduce((a, p) => a + labelOf.get(p)!.score, 0) / ms.length;
          let inc = 0;
          let follow = 0;
          for (const [arc, w] of W) {
            const [a, b] = arc.split(">") as [string, string];
            if (a !== L && b !== L) continue;
            inc += w;
            if (!removed.has(arc) && rank.get(a)! < rank.get(b)!) follow += w;
          }
          const others = kept.filter((x) => x !== L);
          const rl = reach(L, observed);
          const comparable = others.filter((x) => rl.has(x) || reach(x, observed).has(L)).length;
          const sig = {
            "label-agreement": agree,
            "direction-consistency": inc > 0 ? follow / inc : undefined,
            "order-support": others.length ? comparable / others.length : 0,
            "layer-size": ms.length / (ms.length + 2),
          };
          const conf = 0.35 * sig["label-agreement"] + 0.35 * (sig["direction-consistency"] ?? 0) + 0.2 * sig["order-support"] + 0.1 * sig["layer-size"];
          lines.push(
            `  LAYER ${rank.get(L)} ${L} conf=${conf.toFixed(3)} ${Object.entries(sig).map(([k, v]) => `${k}=${v === undefined ? "absent" : v.toFixed(3)}`).join(" ")} files=${ms.sort(cmp).join(", ")}`,
          );
        }
        // layerDependencies over imports
        const impPairs = new Set<string>();
        for (const e of document.edges) {
          if (e.kind !== "imports" && e.kind !== "re-exports") continue;
          const s = model.fileOf(e.source)?.slice(5);
          const t = model.fileOf(e.target)?.slice(5);
          if (s === undefined || t === undefined) continue;
          const a = layerOf.get(s);
          const b = layerOf.get(t);
          if (a !== undefined && b !== undefined && a !== b) impPairs.add(`${a}>${b}`);
        }
        lines.push(`  layer import pairs: ${[...impPairs].sort(cmp).join(" ")}`);
      }
      out.push(...lines);
    }
  } catch (error) {
    out.push(`ERROR ${String(error)} ${(error as Error).stack ?? ""}`);
  }
  writeFileSync(OUT, out.join("\n"));
});
