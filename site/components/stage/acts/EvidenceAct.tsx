import { CodeBlock } from "@/components/ui/CodeBlock";
import { Status } from "@/components/ui/Status";
import { StillFigure } from "../StillFigure";
import film from "../film.module.css";
import styles from "./acts.module.css";
import { Captions, Sentence } from "./Captions";
import {
  baseName,
  EVIDENCE_TITLE,
  evidenceCaptions,
  recordLabel,
  recordNote,
  unboundLines,
  type ActCaption,
} from "./copy";
import { actFacts } from "./facts";
import { RECORD_LINES } from "./shared";
import { EVIDENCE } from "./timing";

/**
 * Act II's server markup. EvidenceAct is the act's block, placed by Film.tsx in the act's slot ([data-act-slot]): its
 * h2, its narration in full sentences, the still figure (still layout only), the relationship's record and its status
 * marks, read once and in order. EvidenceFrame is the act's words over the drawing, placed in its layer
 * ([data-act-layer]): the visual captions, the title block's counts during Link, and the record's provenance rows for
 * tall frames, hidden from assistive technology (the block carries the words).
 *
 * In the film the block's words are visually hidden at the act's anchor, except the record: on wide frames it shows
 * over the frame at E4 (fixed, so it stays in reading order after its h2); on tall ones its provenance rows show in
 * the frame instead, and the full record over the frame only while the keyboard is in it.
 */
export function EvidenceAct() {
  const { evidence: e, stats } = actFacts();
  const [ends, parse, link, record, all] = evidenceCaptions(e, stats) as [
    ActCaption,
    ActCaption,
    ActCaption,
    ActCaption,
    ActCaption,
  ];
  return (
    <div className={styles.block}>
      <div className={styles.read}>
        <h2 className={styles.title}>{EVIDENCE_TITLE}</h2>
        <p className={styles.lede}>
          <Sentence parts={ends.title} /> <Sentence parts={ends.body} />{" "}
          {ends.more !== undefined && <Sentence parts={ends.more} />}
        </p>
      </div>
      <StillFigure act="evidence" className={`${styles.figure}`}>
        <div className={styles.host} data-ev-host="" />
        <p className={`${styles.figureBlock} ${film.titleblock}`}>
          <span>Katedrala&rsquo;s analysis of CodeVerse</span>
          <span>
            {baseName(e.dependent.path)} to {baseName(e.dependency.path)}
          </span>
          <Status status="available" label="Parse and Link, available today" />
        </p>
      </StillFigure>
      <div className={`${styles.read} ${styles.beats}`}>
        {[parse, link].map((beat) => (
          <div key={beat.id} className={styles.beat}>
            <p className={styles.beatTitle}>
              <Sentence parts={beat.title} />
            </p>
            <p className={styles.beatBody}>
              <Sentence parts={beat.body} />{" "}
              {beat.more !== undefined && <Sentence parts={beat.more} />}
            </p>
            <Status status="available" />
          </div>
        ))}
      </div>
      <div className={styles.read}>
        <p className={styles.beatBody}>
          <Sentence parts={record.body} />
        </p>
      </div>
      <div className={styles.record} data-ev-record="">
        <CodeBlock
          code={e.record}
          label={recordLabel(e)}
          language="json"
          lineId={RECORD_LINES}
          className={`${styles.recordCode}`}
        />
        <p className={styles.recordNote}>{recordNote(e)}</p>
      </div>
      <div className={styles.read}>
        <p className={styles.beatTitle}>
          <Sentence parts={all.title} />
        </p>
        <p className={styles.beatBody}>
          <Sentence parts={all.body} /> {all.more !== undefined && <Sentence parts={all.more} />}
        </p>
      </div>
    </div>
  );
}

export function EvidenceFrame() {
  const { evidence: e, stats } = actFacts();
  const captions = evidenceCaptions(e, stats);
  const recorded = e.observations.filter((o) => o.recorded);
  const relationship = e.observations.find((o) => o.recorded);
  const source = e.symbols.find((s) => s.side === "dependent")?.name ?? "";
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.host} data-ev-host="" />
      <Captions
        act="evidence"
        captions={captions}
        windows={[EVIDENCE.e1, EVIDENCE.e2, EVIDENCE.e3, EVIDENCE.e4, EVIDENCE.e5]}
        extra={{
          "evidence-parse": <Status status="available" />,
          "evidence-link": <Status status="available" />,
        }}
      />
      <p
        className={`${film.titleblock} ${styles.swap}`}
        data-ev-titleblock=""
        data-obstacle=""
        data-obstacle-pad="6"
      >
        <span>Katedrala&rsquo;s analysis of CodeVerse</span>
        {unboundLines(stats).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <div className={styles.condensed} data-ev-condensed="" data-obstacle="">
        <p className={styles.condensedHead}>{recordLabel(e)}</p>
        <p className={styles.condensedEdge}>
          <code>{relationship?.kind ?? "calls"}</code> {source} → {relationship?.target ?? ""}
        </p>
        {recorded.map((o) => (
          <p key={o.line} className={styles.condensedRow} data-ev-row={o.line}>
            <code>
              {o.line}:{o.column}
            </code>
            <span>{o.mechanism}</span>
            <span>{o.resolution}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
