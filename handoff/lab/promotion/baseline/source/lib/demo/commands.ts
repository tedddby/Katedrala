/**
 * Terminal transcripts for the five v1 commands. The command line is milestone 11 and does not exist yet, so the
 * layout of the output is a preview. The values are not: `analyze` prints the real counts of Katedrala's analysis
 * of CodeVerse, and the other commands print values computed from the demonstration system.
 */
import { CODEVERSE_ANALYSIS } from "@/lib/site";
import { entropyOf } from "./entropy";
import { VERSIONS } from "./history";
import { impactOf, pathFrom } from "./impact";
import { MEASUREMENTS, formatParts, formatScore } from "./metrics";
import { EDGES, RULE_CHANGE, RULE_CONFIG, checkRules, moduleName, type ModuleId } from "./system";
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
  // An indented row breaks down the row above it: externals are packages, built-ins and environment
  // variables, never all packages.
  const rows: (readonly [string, number])[] = [
    ["files", a.files],
    ["  analyzed", a.analyzedFiles],
    ["directories", a.directories],
    ["symbols", a.symbols],
    ["relationships", a.relationships],
    ["externals", a.externals],
    ["  npm packages", a.packages],
    ["  Node.js built-ins", a.builtins],
    ["  environment variables", a.environmentVariables],
    ["unresolved imports", a.unresolvedImports],
  ];
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  return {
    id: "analyze",
    question: "What is in this repository?",
    source: `real counts: CodeVerse at ${a.commit}`,
    lines: [
      prompt("katedrala analyze ."),
      plain(`${a.repository} at ${a.commit}`, "ink"),
      ...rows.map(([label, value]): TranscriptLine => [
        { text: label.padEnd(width), tone: "faint" },
        { text: count(value).padStart(6), tone: label.startsWith(" ") ? "soft" : "ink" },
      ]),
    ],
  };
}

function health(): CommandDemo {
  const entropy = entropyOf(EDGES.map((e) => [e.source, e.target] as const));
  // Contributions rounded so they add up to the score printed above them.
  const shown = formatParts(
    entropy.factors.map((factor) => factor.contribution),
    entropy.score,
  );
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
      // Each factor, then its evidence on a line of its own, so the report fits a desktop terminal's width.
      ...entropy.factors.flatMap((factor, i): TranscriptLine[] => [
        [
          { text: `  ${factor.label.toLowerCase()}`.padEnd(WIDTH), tone: "faint" },
          { text: `+${shown[i]!}`, tone: "soft" },
        ],
        plain(`    ${factor.evidence}`, "faint"),
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
      // Members that handle HTTP requests, as the Impact section counts them (the IR's entryPoints are declared
      // entries such as package scripts, so the transcript does not borrow that name).
      plain(`HTTP handlers: ${[...result.entryPoints].sort().join(", ")}`, "faint"),
    ],
  };
}

/** The rules of the Rules section, checked against the system with its one hypothetical new import. */
function validate(): CommandDemo {
  const violations = checkRules([...EDGES, RULE_CHANGE]);
  const errors = violations.filter((violation) => violation.rule.severity === "error").length;
  return {
    id: "validate",
    question: "Does the code follow our rules?",
    source: "demonstration system",
    lines: [
      prompt("katedrala validate . --fail-on error"),
      ...violations.flatMap((violation): TranscriptLine[] => [
        [
          {
            text: `${violation.rule.severity}  `,
            tone: violation.rule.severity === "error" ? "load" : "soft",
          },
          { text: violation.rule.id, tone: "ink" },
        ],
        plain(`       ${violation.source} depends on ${violation.target}`),
        plain(`       ${violation.file}`, "faint"),
      ]),
      plain(`${counted(errors, "error")}, ${counted(RULE_CONFIG.rules.length, "rule")} checked`),
      prompt("echo $?"),
      // --fail-on error: any error fails the run.
      plain(errors > 0 ? "1" : "0", "ink"),
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
