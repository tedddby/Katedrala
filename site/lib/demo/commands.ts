/**
 * Terminal transcripts for the five v1 commands. The command line is milestone 11 and does not exist yet, so the
 * layout of the output is a preview. The values are not: `analyze` prints the real counts of Katedrala's analysis
 * of CodeVerse, and the other commands print values computed from the demonstration system.
 */
import { CODEVERSE_ANALYSIS } from "@/lib/site";
import { entropyOf } from "./entropy";
import { VERSIONS } from "./history";
import { impactOf, pathFrom } from "./impact";
import { MEASUREMENTS, formatScore } from "./metrics";
import { EDGES, moduleName, type ModuleId } from "./system";
import { counted, rests } from "@/lib/text";

export type Tone = "ink" | "soft" | "faint" | "load";

export interface Segment {
  readonly text: string;
  readonly tone?: Tone;
}

/** One line of a transcript; a line that starts with a `$` segment is a command the user typed. */
export type TranscriptLine = readonly Segment[];

export interface CommandDemo {
  readonly id: "analyze" | "health" | "impact" | "validate" | "diff";
  readonly question: string;
  /** Where the values come from, shown in the terminal header. */
  readonly source: string;
  readonly lines: readonly TranscriptLine[];
}

const prompt = (command: string): TranscriptLine => [
  { text: "$ ", tone: "faint" },
  { text: command, tone: "ink" },
];
const plain = (text: string, tone: Tone = "soft"): TranscriptLine => [{ text, tone }];
const count = (value: number) => value.toLocaleString("en-US");
/** Width of the label column, so values line up. */
const WIDTH = 21;
const signed = (value: number) => `${value >= 0 ? "+" : "-"}${formatScore(Math.abs(value))}`;

function analyze(): CommandDemo {
  const a = CODEVERSE_ANALYSIS;
  const rows: [string, number, string?][] = [
    ["files", a.files, `${count(a.analyzedFiles)} analyzed`],
    ["directories", a.directories],
    ["symbols", a.symbols],
    ["relationships", a.relationships],
    ["external packages", a.externals],
    ["unresolved imports", a.unresolvedImports],
  ];
  return {
    id: "analyze",
    question: "What is in this repository?",
    source: `real counts: CodeVerse at ${a.commit}`,
    lines: [
      prompt("katedrala analyze ."),
      plain(`${a.repository} at ${a.commit}`, "ink"),
      ...rows.map(([label, value, note]): TranscriptLine => [
        { text: label.padEnd(WIDTH), tone: "faint" },
        { text: count(value).padStart(6), tone: "ink" },
        ...(note === undefined ? [] : [{ text: `   ${note}`, tone: "faint" as const }]),
      ]),
    ],
  };
}

function health(): CommandDemo {
  const entropy = entropyOf(EDGES.map((e) => [e.source, e.target] as const));
  const heaviest = [...MEASUREMENTS.values()]
    .sort((a, b) => b.gravity - a.gravity || (a.node.id < b.node.id ? -1 : 1))
    .slice(0, 3);
  return {
    id: "health",
    question: "Where is the structure weak?",
    source: "demonstration system",
    lines: [
      prompt("katedrala health ."),
      [
        { text: "entropy".padEnd(WIDTH), tone: "faint" },
        { text: formatScore(entropy.score).padStart(5), tone: "ink" },
        { text: `  ${entropy.rating}`, tone: "soft" },
      ],
      ...entropy.factors.map((factor): TranscriptLine => [
        { text: `  ${factor.label.toLowerCase()}`.padEnd(WIDTH), tone: "faint" },
        { text: signed(factor.contribution), tone: "soft" },
        { text: `  ${factor.evidence}`, tone: "faint" },
      ]),
      plain("highest gravity", "faint"),
      ...heaviest.map((m): TranscriptLine => [
        { text: `  ${m.node.id}`.padEnd(WIDTH), tone: "soft" },
        { text: formatScore(m.gravity).padStart(5), tone: "ink" },
        {
          text: `  ${counted(m.transitiveDependents.length, "member")} ${rests(m.transitiveDependents.length)} on it`,
          tone: "faint",
        },
      ]),
    ],
  };
}

function impact(): CommandDemo {
  const result = impactOf("OrderService");
  return {
    id: "impact",
    question: "What will this change touch?",
    source: "demonstration system",
    lines: [
      prompt(`katedrala impact ${result.target}`),
      plain(
        `${counted(result.affected.length, "member")} in ${counted(result.modules.size, "module")} ${result.affected.length === 1 ? "depends" : "depend"} on ${result.target}`,
        "ink",
      ),
      ...result.affected.map(([id, distance]): TranscriptLine => {
        const path = pathFrom(id, result);
        return [
          { text: `${distance}  `, tone: "faint" },
          { text: path[0]!, tone: "ink" },
          {
            text: path
              .slice(1, -1)
              .map((step) => ` → ${step}`)
              .join(""),
            tone: "soft",
          },
          { text: " → ", tone: "soft" },
          { text: result.target, tone: "load" },
        ];
      }),
      plain(`entry points: ${[...result.entryPoints].sort().join(", ")}`, "faint"),
    ],
  };
}

function validate(): CommandDemo {
  return {
    id: "validate",
    question: "Does the code follow our rules?",
    source: "demonstration system",
    lines: [
      prompt("katedrala validate . --fail-on error"),
      [
        { text: "error  ", tone: "load" },
        { text: "controllers-no-database", tone: "ink" },
      ],
      plain("       OrderController depends on OrderRepository"),
      plain("       src/orders/order.controller.ts:7", "faint"),
      plain("1 error, 2 rules checked"),
      prompt("echo $?"),
      plain("1", "ink"),
    ],
  };
}

function diff(): CommandDemo {
  const before = VERSIONS[3]!;
  const after = VERSIONS[4]!;
  const key = ([s, t]: readonly [string, string]) => `${s}>${t}`;
  const known = new Set(before.edges.map(key));
  const added = after.edges.filter((edge) => !known.has(key(edge)));
  const change = after.entropy.score - before.entropy.score;
  return {
    id: "diff",
    question: "What changed between two revisions?",
    source: "demonstration system",
    lines: [
      prompt(`katedrala diff ${before.tag} ${after.tag}`),
      ...added.map(([s, t]): TranscriptLine => [
        { text: "+ dependency".padEnd(WIDTH), tone: "faint" },
        { text: `${s} → ${t}`, tone: "ink" },
      ]),
      ...[...after.newModuleEdges].map((edge): TranscriptLine => {
        const [s, t] = edge.split(">") as [ModuleId, ModuleId];
        return [
          { text: "+ module dependency".padEnd(WIDTH), tone: "faint" },
          { text: `${moduleName(s)} → ${moduleName(t)}`, tone: "ink" },
        ];
      }),
      ...(after.cycle === undefined
        ? []
        : [
            [
              { text: "+ cycle".padEnd(WIDTH), tone: "faint" },
              { text: after.cycle.map((m) => moduleName(m)).join(" → "), tone: "load" },
            ] satisfies TranscriptLine,
          ]),
      [
        { text: "entropy".padEnd(WIDTH), tone: "faint" },
        {
          text: `${formatScore(before.entropy.score)} → ${formatScore(after.entropy.score)}`,
          tone: "ink",
        },
        {
          text: `  ${signed(change)}, ${before.entropy.rating} → ${after.entropy.rating}`,
          tone: "soft",
        },
      ],
    ],
  };
}

export const COMMANDS: readonly CommandDemo[] = [analyze(), health(), impact(), validate(), diff()];
