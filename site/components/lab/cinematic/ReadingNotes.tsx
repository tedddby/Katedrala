import graph from "@/public/data/codeverse-graph.json";
import { buildModel, countOf, formatCount, summarize, type GraphData } from "./model";
import styles from "./cinematic.module.css";

/**
 * What follows the film: how to read the drawing, with every convention named and every source stated. It
 * separates Katedrala's analysis (files and their runtime dependencies) from what this page computes from it
 * (levels, reach, foundations) and from what the drawing adds (positions, line weights, motion), so nothing on
 * the stage passes for more than it is.
 */
export function ReadingNotes() {
  const data = graph as unknown as GraphData;
  const summary = summarize(buildModel(data), data);
  const notes = [
    {
      term: "A ring is a source file",
      text: "Its size follows its lines of code. Solid discs are the foundations: files that depend on no other source file.",
    },
    {
      term: "A line is a runtime dependency",
      text: `${formatCount(summary.dependencies)} of them, between source files. Files joined only by type-only references are left out: types hold nothing up at runtime.`,
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
      text: `Katedrala's document of ${summary.repository} at ${summary.commit} (${summary.generator}, IR schema ${summary.schemaVersion}), lifted from symbols to files for this page. The ${countOf(summary.testFiles, "test file")} are left out: no source file rests on them. CodeVerse is a separate open-source project; Katedrala does not depend on it.`,
    },
  ];
  return (
    <section className={styles.reading} aria-labelledby="reading-title">
      <h2 id="reading-title" className={styles.readingTitle}>
        How to read the drawing
      </h2>
      <dl className={styles.readingList}>
        {notes.map((note) => (
          <div key={note.term} className={styles.readingItem}>
            <dt>{note.term}</dt>
            <dd>{note.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
