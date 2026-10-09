/**
 * The words of Acts II, III and the landing. Every number comes from the evidence JSON (through the act payload),
 * the graph JSON (through the model's summary) or trace.ts, and is formatted here; no number is typed in by hand
 * (the only figures in this file serve grammar: one or many, first or after). Shared by the server markup (visual
 * captions, narration blocks, title blocks) and the browser (labels on the drawing, the counter, the landing's
 * readout), so both always say the same.
 */
import type { CaptionPart } from "../copy/hanging";
import { countOf, formatCount } from "../model";
import type { EvidencePayload } from "./payload";
import type { Reach } from "./trace";

const t = (text: string): CaptionPart => ({ text });
const c = (text: string): CaptionPart => ({ text, code: true });

/** A caption: its title and body, and the sentences the narration adds (read and shown in the still article). */
export interface ActCaption {
  readonly id: string;
  readonly title: readonly CaptionPart[];
  readonly body: readonly CaptionPart[];
  readonly more?: readonly CaptionPart[];
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TIMES = ["never", "once", "twice"];

/** Small counts as words, the rest as figures: "four functions", "14,233 relationships". */
export function spelled(n: number): string {
  return WORDS[n] ?? formatCount(n);
}

/** "once", "twice", "seven times". */
function times(n: number): string {
  return TIMES[n] ?? `${spelled(n)} times`;
}

/** The last part of a path: "cache-key.ts". */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** "lines 141 to 369" */
export function linesOf(from: number, to: number): string {
  return from === to
    ? `line ${formatCount(from)}`
    : `lines ${formatCount(from)} to ${formatCount(to)}`;
}

/** Joined the way the page's prose lists things: "a, b and c"; items with commas of their own, "a; b; and c". */
function listed(items: readonly string[], separator = ", "): string {
  if (items.length < 2) return items.join("");
  const last = separator === ", " ? " and " : `${separator}and `;
  return `${items.slice(0, -1).join(separator)}${last}${items.at(-1)}`;
}

/** Plural of a symbol kind: "function", "functions"; "class", "classes". */
function kinds(kind: string, n: number): string {
  return n === 1 ? kind : kind.endsWith("s") ? `${kind}es` : `${kind}s`;
}

/** "1 file", "48 files"; the verb agreeing: "1 file rests", "48 files rest". */
const files = (n: number) => countOf(n, "file");

/* ------------------------------------------------------------------------------------------------------------
 * Act II, "Every conclusion has evidence."
 * ---------------------------------------------------------------------------------------------------------- */

export const EVIDENCE_TITLE = "Every conclusion has evidence.";

/** The repository's counts the act quotes (repository.stats and the edge kinds, as the evidence JSON copies them). */
export interface EvidenceStats {
  readonly analyzedFiles: number;
  readonly symbols: number;
  readonly edges: number;
  readonly unresolvedImports: number;
  readonly unresolvedReferences: number;
  readonly untypedReferences: number;
  /** The kinds the closing caption names, most first; the others are counted together. */
  readonly named: readonly (readonly [kind: string, count: number])[];
  readonly others: readonly (readonly [kind: string, count: number])[];
  /** Runtime dependencies between source files: the chains the drawing joins files with. */
  readonly chains: number;
}

/** The note on a file's ring at E1: "369 lines, 13 symbols, level 9". */
export function fileFacts(f: EvidencePayload["dependent"]): string {
  return `${countOf(f.lines, "line")}, ${countOf(f.symbols, "symbol")}, level ${formatCount(f.level)}`;
}

/** What the dependency declares, as its symbols' kinds have it: "four functions". */
function declared(e: EvidencePayload): string {
  const own = e.symbols.filter((s) => s.side === "dependency");
  const first = own[0]?.kind ?? "symbol";
  const kind = own.every((s) => s.kind === first) ? first : "symbol";
  return `${spelled(own.length)} ${kinds(kind, own.length)}`;
}

/** The observations by what they bind: the imports (bound to the file), and the symbols the others bind to. */
function bindings(e: EvidencePayload) {
  const imports = e.observations.filter((o) => o.target === null);
  const targets = [
    ...new Set(e.observations.flatMap((o) => (o.target === null ? [] : [o.target]))),
  ];
  return { imports, targets };
}

export function evidenceCaptions(e: EvidencePayload, s: EvidenceStats): ActCaption[] {
  const { imports, targets } = bindings(e);
  const bound = targets.map((name) => {
    const seen = e.observations.filter((o) => o.target === name);
    const lines = seen.map((o) => formatCount(o.line));
    const verb = seen.every((o) => o.kind === "calls") ? "calls" : "references";
    return `the ${verb} at ${lines.length === 1 ? "line" : "lines"} ${listed(lines)} bind to ${name}`;
  });
  const own = e.symbols
    .filter((sym) => sym.side === "dependency")
    .sort((p, q) => p.from - q.from)
    .map(
      (sym) => `${sym.name}, ${linesOf(sym.from, sym.to)}${sym.exported ? "" : ", not exported"}`,
    );
  const main = e.symbols.filter((sym) => sym.side === "dependent");
  const calls = targets.length;
  return [
    {
      id: "evidence-ends",
      title: [t("Every line in the drawing has a record behind it.")],
      body: [
        t("This one runs from "),
        c(e.dependent.path),
        t(" down to "),
        c(e.dependency.path),
        t("."),
      ],
      more: [
        t(
          `The first has ${countOf(e.dependent.lines, "line")} and ${countOf(e.dependent.symbols, "symbol")}, at level ${formatCount(e.dependent.level)}; the second has ${countOf(e.dependency.lines, "line")} and ${countOf(e.dependency.symbols, "symbol")}, at level ${formatCount(e.dependency.level)}.`,
        ),
      ],
    },
    {
      id: "evidence-parse",
      title: [t("Katedrala parses each file into its symbols.")],
      body: [
        c(baseName(e.dependency.path)),
        t(
          ` declares ${declared(e)}. Across CodeVerse: ${countOf(s.symbols, "symbol")} in ${files(s.analyzedFiles)}.`,
        ),
      ],
      more: [
        t(
          `In ${baseName(e.dependent.path)}, ${listed(main.map((sym) => `${sym.name} spans ${linesOf(sym.from, sym.to)}`))}. In ${baseName(e.dependency.path)}: ${listed(own, "; ")}.`,
        ),
      ],
    },
    {
      id: "evidence-link",
      title: [t("Then it binds references to what they name.")],
      body: [
        t(
          `Between these two files: ${spelled(imports.length)} ${imports.length === 1 ? "import" : "imports"} and calls to ${spelled(calls)} of its ${kinds("function", calls)}, ${spelled(e.observations.length)} observations in all. What cannot be bound is counted, never guessed.`,
        ),
      ],
      more: [
        t(
          `The import at ${listed(imports.map((o) => `line ${formatCount(o.line)}`))} binds to the file; ${listed(bound)}. Across CodeVerse, ${s.unresolvedImports === 0 ? "every import was resolved" : `${countOf(s.unresolvedImports, "import")} could not be resolved`}; ${countOf(s.unresolvedReferences, "reference")} could not be bound although a binding should exist (an unknown name, or a member a module does not export); and ${countOf(s.untypedReferences, "reference")} reach members of values whose type cannot be known without type checking, so the relationships through them are missing from the document.`,
        ),
      ],
    },
    {
      id: "evidence-record",
      title: [t(EVIDENCE_TITLE)],
      body: [
        t(
          "Every relationship points to the lines of code it came from, and every score will break down into its measurements.",
        ),
      ],
    },
    {
      id: "evidence-all",
      title: [t(`${formatCount(s.edges)} relationships, each recorded like this one.`)],
      body: [
        ...s.named.flatMap(([kind, n], i) => [
          ...(i === 0 ? [] : [t(", ")]),
          c(kind),
          t(` ${formatCount(n)}`),
        ]),
        t(
          `, and ${formatCount(s.others.reduce((sum, [, n]) => sum + n, 0))} of ${spelled(s.others.length)} other kinds.`,
        ),
      ],
      more: [
        t(
          `The drawing joins source files wherever one depends on another at runtime: ${countOf(s.chains, "dependency", "dependencies")}.`,
        ),
      ],
    },
  ];
}

/** E3's title block lines: what cannot be bound, counted. */
export function unboundLines(s: EvidenceStats): string[] {
  return [
    `unresolved imports ${formatCount(s.unresolvedImports)}`,
    `unresolved references ${formatCount(s.unresolvedReferences)}`,
    `untyped references ${formatCount(s.untypedReferences)}`,
  ];
}

/** The record's caption in the narration block. */
export function recordNote(e: EvidencePayload): string {
  const recorded = e.observations.filter((o) => o.recorded);
  const target = recorded[0]?.target ?? baseName(e.dependency.path);
  const source = e.symbols.find((s) => s.side === "dependent")?.name ?? baseName(e.dependent.path);
  return `From Katedrala’s analysis of the open-source CodeVerse repository: a call from ${source} to ${target}, observed ${times(recorded.length)}, each observation with its file, line, column, syntax and the rule that resolved it.`;
}

/** The label of the record's code block. */
export function recordLabel(e: EvidencePayload): string {
  return `real output: CodeVerse at ${e.commit}`;
}

/** The detail's scale, written on it as on an architect's detail. */
export function detailScale(scale: number): string {
  return `detail at ${formatCount(scale)}× scale`;
}

/** A ruler's head: the file and its length. */
export function rulerHead(path: string, lines: number): string {
  return `${path}, ${countOf(lines, "line")}`;
}

/* ------------------------------------------------------------------------------------------------------------
 * Act III, "Know what a change will touch before you make it."
 * ---------------------------------------------------------------------------------------------------------- */

export const CHANGE_TITLE = "Know what a change will touch before you make it.";
export const IMPACT_STATUS = "Impact analysis, planned for v1";
export const SCOPE_LINE =
  "Traced by this page over the dependencies in Katedrala’s analysis of CodeVerse.";

/** Act III's facts: the subject, its trace up through what rests on it, step by step, and its wider scopes. */
export interface ChangeFacts {
  readonly path: string;
  readonly lines: number;
  readonly foundation: boolean;
  /** Files reached at each step (runtime, source files), from the first. */
  readonly steps: readonly number[];
  /** Source files reached at runtime, with type-only dependencies, and every file with the tests. */
  readonly reach: Reach;
  readonly sourceFiles: number;
  /** The shortest path from the crown down to the subject, crown first. */
  readonly crownPath: readonly string[];
}

/** "48 directly, 78 through one other file, 17 through two, 4 through three." */
export function stepsSentence(steps: readonly number[]): string {
  const parts = steps.map((n, i) => {
    if (i === 0) return `${formatCount(n)} directly`;
    // The first time in full ("through one other file"), then shortened ("through two").
    return i === 1
      ? `${formatCount(n)} through ${spelled(i)} other file`
      : `${formatCount(n)} through ${spelled(i)}`;
  });
  return `${parts.join(", ")}.`;
}

export function changeCaptions(f: ChangeFacts): ActCaption[] {
  const direct = f.steps[0] ?? 0;
  const [crown, ...rest] = f.crownPath;
  const between = rest.slice(0, -1);
  return [
    {
      id: "change-title",
      title: [t(CHANGE_TITLE)],
      body: [
        t(
          "Katedrala will trace dependency paths out from a change to estimate its structural blast radius, path by path.",
        ),
      ],
    },
    {
      id: "change-subject",
      title: [t("What happens if you change "), c(f.path), t("?")],
      body: [
        t(
          `${f.foundation ? "A foundation" : "A file"} of ${countOf(f.lines, "line")}. ${countOf(direct, "file depends", "files depend")} on it directly at runtime.`,
        ),
      ],
    },
    {
      id: "change-rise",
      title: [t("The change travels up through everything that rests on it.")],
      body: [t(stepsSentence(f.steps))],
    },
    {
      id: "change-reach",
      title: [
        t(
          `${formatCount(f.reach.runtime)} of the ${countOf(f.sourceFiles, "source file")} ${f.reach.runtime === 1 ? "rests" : "rest"} on it.`,
        ),
      ],
      body: [
        t(
          `Count type-only dependencies too and it is ${countOf(f.reach.types, "source file")}; with the tests, ${files(f.reach.tests)}.`,
        ),
      ],
      more: [
        t(
          `From the crown, the shortest path down to it runs from ${crown ?? f.path}${between.length > 0 ? ` through ${listed(between)}` : ""} to ${f.path}.`,
        ),
      ],
    },
  ];
}

/** The second line of the film's title block: "tedddby/CodeVerse at 6b942bc, 404 source files". */
export function sourceLine(repository: string, commit: string, sourceFiles: number): string {
  return `${repository} at ${commit}, ${countOf(sourceFiles, "source file")}`;
}

/** A figure's fact: "147 of 404 source files rest on types.ts". */
export function reachFact(reached: number, sourceFiles: number, path: string): string {
  return `${formatCount(reached)} of ${countOf(sourceFiles, "source file")} ${reached === 1 ? "rests" : "rest"} on ${baseName(path)}`;
}

/** The counter's label. */
export const COUNTER_LABEL = "files reached";

/** The subject's note on the drawing: "Foundation, 471 lines." */
export function subjectNote(lines: number, foundation: boolean): string {
  return `${foundation ? "Foundation" : "File"}, ${countOf(lines, "line")}.`;
}

/** The note on each file of the path from the crown down to the subject (crown first). */
export function pathNote(level: number, index: number, count: number): string {
  if (index === count - 1) return "the change";
  return index === 0 ? `level ${formatCount(level)}, the crown` : `level ${formatCount(level)}`;
}

/* ------------------------------------------------------------------------------------------------------------
 * The landing, "Trace any file."
 * ---------------------------------------------------------------------------------------------------------- */

export const LANDING_TITLE = "Trace any file.";
export const LANDING_LEDE =
  "Hover or tap a file in the drawing, or choose one here. Load blue shows what it stands on, or what rests on it.";
export const SHOW_LABEL = "Show";
export const SHOW_DOWN = "What it stands on";
export const SHOW_UP = "What rests on it";
export const FILE_LABEL = "File";
export const FILE_NONE = "Choose a file";
export const PICKS_LABEL = "Start from";
export const READOUT_NONE = "Choose a file to trace it.";
export const LEGEND_LABEL = "Legend";

/** What a file stands on, in the readout: "src/app/page.tsx stands on 137 files at runtime, 40 of them foundations." */
export function standsOnSentence(path: string, r: Reach, foundation: boolean): string {
  if (r.runtime === 0) {
    return foundation
      ? `${path} is a foundation: it depends on no other source file at runtime.`
      : `${path} depends on no other source file at runtime.`;
  }
  return `${path} stands on ${files(r.runtime)} at runtime, ${formatCount(r.foundations)} of them ${r.foundations === 1 ? "a foundation" : "foundations"}.`;
}

/**
 * What rests on a file, in the readout: "88 files rest on src/lib/utils/cn.ts at runtime, 63 directly; 90 with
 * type-only dependencies; 113 with tests."
 */
export function restsOnSentence(path: string, r: Reach): string {
  const wider = `${formatCount(r.types)} with type-only dependencies; ${formatCount(r.tests)} with tests.`;
  if (r.runtime === 0) {
    return r.tests === 0
      ? `Nothing rests on ${path}, at runtime or otherwise.`
      : `Nothing rests on ${path} at runtime; ${wider}`;
  }
  return `${countOf(r.runtime, "file rests", "files rest")} on ${path} at runtime, ${formatCount(r.direct)} directly; ${wider}`;
}

/** A traced file's note on the drawing: one sentence, as Act I's labels have it. */
export function traceNote(
  level: number,
  lines: number,
  direction: "down" | "up",
  r: Reach,
  foundation: boolean,
): string {
  const head = `${foundation ? "Foundation" : `Level ${formatCount(level)}`}, ${countOf(lines, "line")}.`;
  if (direction === "down") {
    return r.runtime === 0
      ? `${head} Stands on no other file.`
      : `${head} Stands on ${files(r.runtime)}, ${formatCount(r.foundations)} of them ${r.foundations === 1 ? "a foundation" : "foundations"}.`;
  }
  return r.runtime === 0
    ? `${head} Nothing rests on it at runtime.`
    : `${head} ${countOf(r.runtime, "file rests", "files rest")} on it, ${formatCount(r.direct)} directly.`;
}

/** The note on a lit file hovered while another is traced: how it is joined to the file traced. */
export function pathToNote(subject: string, steps: number, direction: "down" | "up"): string {
  const via = steps <= 1 ? "directly" : `through ${countOf(steps - 1, "other file")}`;
  return direction === "up"
    ? `Rests on ${baseName(subject)} ${via}.`
    : `${baseName(subject)} stands on it ${via}.`;
}
