import { codeverse } from "./codeverse";
import { legendKeysOf, legendNotesOf, type LegendMark } from "./copy/legend";
import styles from "./legend.module.css";

/** Each mark drawn as the stage draws it, in one stroke: the legend reads like the drawing's own key. */
function Mark({ mark }: { mark: LegendMark }) {
  return (
    <svg className={styles.mark} viewBox="0 0 28 16" aria-hidden="true">
      {mark === "ring" && <circle cx="14" cy="8" r="4.5" className={styles.ring} />}
      {mark === "disc" && <circle cx="14" cy="8" r="4.5" className={styles.disc} />}
      {mark === "line" && (
        <>
          <path d="M5 12.5Q14 3 23 10" className={styles.chain} />
          <circle cx="5" cy="12.5" r="2" className={styles.ring} />
          <circle cx="23" cy="10" r="2" className={styles.ring} />
        </>
      )}
      {mark === "height" && (
        <>
          <path d="M3 14.5h22" className={styles.ground} />
          <path d="M14 14.5V2.5M11 10.5h6M11 6.5h6M11 2.5h6" className={styles.scale} />
        </>
      )}
      {mark === "drawn" && (
        <>
          <path d="M3 5.5h22" className={styles.thin} />
          <path d="M3 11h22" className={styles.thick} />
        </>
      )}
    </svg>
  );
}

/**
 * The drawing's key and "How to read the drawing": every mark named, then the six notes that separate Katedrala's
 * analysis from what this page computes from it and from what the drawing adds. Numbers from the analysis summary.
 * The landing places it beside its controls (always visible on wide screens; it may wrap it in a disclosure on
 * phones).
 */
export function Legend({ className }: { className?: string }) {
  const { summary } = codeverse();
  const keys = legendKeysOf(summary);
  const notes = legendNotesOf(summary);
  return (
    <div className={className === undefined ? styles.legend : `${styles.legend} ${className}`}>
      <dl className={styles.keys}>
        {keys.map((key) => (
          <div key={key.mark} className={styles.key}>
            <dt>
              <Mark mark={key.mark} />
              {key.term}
            </dt>
            <dd>{key.text}</dd>
          </div>
        ))}
      </dl>
      <details className={styles.notes}>
        <summary className={styles.summary}>
          How to read the drawing
          <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5l3-3" />
          </svg>
        </summary>
        <dl className={styles.noteList}>
          {notes.map((note) => (
            <div key={note.term} className={styles.note}>
              <dt>{note.term}</dt>
              <dd>{note.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
