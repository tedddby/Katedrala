/**
 * The film's words. Every number is computed from Katedrala's analysis of CodeVerse (via the summary); nothing
 * here is typed in by hand except the sentences around the numbers. Shared by the server markup and the client
 * choreography (which only needs the windows and the notes on traced files).
 */
import { BEAT } from "./timeline";
import {
  countOf,
  formatCount,
  type HangingModel,
  type LoadPath,
  type StructureSummary,
} from "./model";

export interface CaptionPart {
  readonly text: string;
  /** Set in the monospace face: a path or identifier. */
  readonly code?: boolean;
  /** This word turns over with the model. */
  readonly turns?: boolean;
}

export interface Caption {
  readonly id: string;
  /** Shown while the film's progress is in [from, to]. */
  readonly from: number;
  readonly to: number;
  readonly title: readonly CaptionPart[];
  readonly body: readonly CaptionPart[];
}

const t = (text: string): CaptionPart => ({ text });
const c = (text: string): CaptionPart => ({ text, code: true });

/** A caption's words as one plain sentence: the transcript that assistive technology reads. */
export function plainOf(parts: readonly CaptionPart[]): string {
  return parts.map((part) => part.text).join("");
}

export function captionsOf(s: StructureSummary): Caption[] {
  const heaviest = s.heaviest[0]!;
  const top = s.spine[0]!;
  return [
    {
      id: "plan",
      from: 0.052,
      to: 0.118,
      title: [t(`${formatCount(s.foundations)} foundations, set out on a plan.`)],
      body: [
        t(
          "The files of CodeVerse that depend on no other source file. Everything else will hang from them.",
        ),
      ],
    },
    {
      id: "weights",
      from: 0.124,
      to: 0.2,
      title: [t("Every other file hangs from the files it depends on.")],
      body: [t("Each one is a weight, as heavy as its lines of code.")],
    },
    {
      id: "chains",
      from: 0.206,
      to: 0.292,
      title: [t(`${formatCount(s.dependencies)} runtime dependencies pull taut.`)],
      body: [t(`Level by level, ${s.maxLevel} levels below the board.`)],
    },
    {
      id: "gravity",
      from: 0.3,
      to: BEAT.hangEnd,
      title: [t("Gravity finds the form.")],
      body: [
        t(
          "Antoni Gaudí found the vaults of the Colònia Güell church this way: weighted strings hung from a plan, photographed, then turned over.",
        ),
      ],
    },
    {
      id: "lowest",
      from: 0.412,
      to: BEAT.circleEnd - 0.01,
      title: [t("The lowest weight is "), c(s.crown.path), t(".")],
      body: [
        t(
          `It hangs from ${countOf(s.crown.supports, "file")}, among them ${formatCount(s.crown.foundations)} of the ${formatCount(s.foundations)} foundations.`,
        ),
      ],
    },
    {
      id: "turn",
      from: BEAT.freezeEnd + 0.004,
      to: BEAT.turnEnd - 0.004,
      title: [t("Turn it over and it "), { text: "stands.", turns: true }],
      body: [
        t("Chains in tension become arches in compression: the hanging form is the standing one."),
      ],
    },
    {
      id: "load",
      from: BEAT.turnEnd + 0.004,
      to: BEAT.waveEnd + 0.01,
      title: [t("Load runs down to the foundations.")],
      body: [
        t("The heaviest, "),
        c(heaviest.path),
        t(`, carries ${countOf(heaviest.reach, "file")}.`),
      ],
    },
    {
      id: "rise",
      from: BEAT.zoomEnd - 0.004,
      to: BEAT.riseEnd + 0.012,
      title: [t(`${s.levels} levels from the ground to the crown.`)],
      body: [t("Climbing the longest load path, from "), c(top), t(" up.")],
    },
  ];
}

/**
 * One file in a sentence: what it stands on (or hangs from, before the turn), or for a foundation, what rests on
 * it. Used for the label on the drawing, the trace buttons' descriptions and the status message.
 */
export function fileNote(
  model: HangingModel,
  v: number,
  path: LoadPath,
  standing: boolean,
): string {
  const lines = countOf(model.lines[v]!, "line");
  if (model.foundation[v] === 1) {
    const reach = model.reach[v]!;
    const verb = standing ? (reach === 1 ? "rests" : "rest") : reach === 1 ? "hangs" : "hang";
    return `Foundation, ${lines}. ${countOf(reach, "file")} ${verb} ${standing ? "on" : "from"} it.`;
  }
  if (model.level[v] === 0) return `${lines}. Nothing depends on it; it depends on nothing.`;
  return `Level ${model.level[v]}, ${lines}. ${standing ? "Stands on" : "Hangs from"} ${countOf(path.supportCount, "file")}, ${formatCount(path.foundationCount)} of them ${path.foundationCount === 1 ? "a foundation" : "foundations"}.`;
}

/** The text alternative: what the drawing shows, in full sentences. */
export function describe(s: StructureSummary): string[] {
  const perLevel = s.levelCount
    .map((count, level) => `${formatCount(count)} at level ${level}`)
    .join(", ");
  const heaviest = s.heaviest
    .map((h) => `${h.path} (${countOf(h.reach, "file")} rest on it)`)
    .join(", ");
  return [
    `Katedrala's analysis of CodeVerse (${s.repository} at commit ${s.commit}, ${s.generator}, IR schema ${s.schemaVersion}), drawn as a hanging-chain model that is then turned over.`,
    `${countOf(s.sourceFiles, "source file")} are drawn; the ${countOf(s.testFiles, "test file")} are left out because no source file rests on them.`,
    `${countOf(s.foundations, "foundation")} depend on no other source file and stand on the ground. Every other file stands on the files it depends on, along ${countOf(s.dependencies, "runtime dependency", "runtime dependencies")}, in ${s.levels} levels: ${perLevel}.`,
    `The heaviest foundations: ${heaviest}.`,
    `The highest file, ${s.crown.path}, is at level ${s.crown.level}. It depends directly on ${countOf(s.crown.direct, "file")} and stands on ${countOf(s.crown.supports, "file")}, ${formatCount(s.crown.foundations)} of them foundations.`,
    `${countOf(s.entries, "file depends", "files depend")} on other files while nothing depends on them; ${countOf(s.isolated, "file is", "files are")} isolated.`,
    "Levels, reach and foundations are computed for this drawing from the relationships in Katedrala's document; positions, line weights and motion are drawn.",
  ];
}
