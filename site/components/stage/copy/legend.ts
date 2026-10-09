/**
 * The drawing's legend and "How to read the drawing": every convention named and every source stated. It separates
 * Katedrala's analysis (files and their runtime dependencies) from what this page computes from it (levels, reach,
 * foundations) and from what the drawing adds (positions, line weights, motion), so nothing on the stage passes for
 * more than it is. Numbers come from the summary.
 */
import { countOf, formatCount, type StructureSummary } from "../model";

export type LegendMark = "ring" | "disc" | "line" | "height" | "drawn";

export interface LegendKey {
  readonly mark: LegendMark;
  readonly term: string;
  readonly text: string;
}

export interface LegendNote {
  readonly term: string;
  readonly text: string;
}

/** The key: one line per mark on the drawing. */
export function legendKeysOf(s: StructureSummary): LegendKey[] {
  return [
    { mark: "ring", term: "Source file", text: "A ring, sized by its lines of code." },
    { mark: "disc", term: "Foundation", text: "A solid disc: it depends on no other source file." },
    {
      mark: "line",
      term: "Runtime dependency",
      text: `A line between two source files, ${formatCount(s.dependencies)} in all.`,
    },
    {
      mark: "height",
      term: "Level",
      text: `Height above the ground, ${s.levels} levels: the longest runtime path down to a foundation.`,
    },
    {
      mark: "drawn",
      term: "Drawn by this page",
      text: "Line weight and every position. They are not Katedrala output.",
    },
  ];
}

/** "How to read the drawing": the six notes. */
export function legendNotesOf(s: StructureSummary): LegendNote[] {
  return [
    {
      term: "A ring is a source file",
      text: "Its size follows its lines of code. Solid discs are the foundations: files that depend on no other source file.",
    },
    {
      term: "A line is a runtime dependency",
      text: `${formatCount(s.dependencies)} of them, between source files. Files joined only by type-only references are left out: types hold nothing up at runtime.`,
    },
    {
      term: "Height is the level",
      text: "The longest runtime path from a file down to a foundation, computed for this drawing from the relationships in Katedrala's document. Files in one dependency cycle share a level.",
    },
    {
      term: "Line weight is drawn",
      text: "Each file's lines of code, plus everything hanging from it, shared equally among the files it depends on. A drawing convention, not a Katedrala metric.",
    },
    {
      term: "Position on the plan is drawn",
      text: "Foundations sit around the band by directory; every other file settles under the files it depends on. The motion is simulated: gravity, chains that only pull, springs that settle.",
    },
    {
      term: "The data",
      text: `Katedrala's document of ${s.repository} at ${s.commit} (${s.generator}, IR schema ${s.schemaVersion}), lifted from symbols to files for this page. The ${countOf(s.testFiles, "test file")} are left out: no source file rests on them. CodeVerse is a separate open-source project, and Katedrala does not depend on it.`,
    },
  ];
}
