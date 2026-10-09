import { Status } from "@/components/ui/Status";
import { StillFigure } from "../StillFigure";
import film from "../film.module.css";
import { formatCount } from "../model";
import styles from "./acts.module.css";
import { Captions, Sentence } from "./Captions";
import {
  CHANGE_TITLE,
  changeCaptions,
  COUNTER_LABEL,
  IMPACT_STATUS,
  reachFact,
  SCOPE_LINE,
  sourceLine,
  type ActCaption,
} from "./copy";
import { actFacts } from "./facts";
import { CHANGE } from "./timing";

/**
 * Act III's server markup: ChangeAct is the act's block (its slot), ChangeFrame its words over the drawing (its
 * layer). See EvidenceAct.tsx for the contract. The status (impact analysis, planned for v1) sits beside the act's
 * title in both, and in the title block for the whole act; the scope line sits beside the numbers it qualifies.
 */
export function ChangeAct() {
  const { change } = actFacts();
  const [title, subject, rise, reach] = changeCaptions(change) as [
    ActCaption,
    ActCaption,
    ActCaption,
    ActCaption,
  ];
  return (
    <div className={styles.block}>
      <div className={styles.read}>
        <h2 className={styles.title}>{CHANGE_TITLE}</h2>
        <div className={styles.statusLine}>
          <Status status="planned" label={IMPACT_STATUS} />
        </div>
        <p className={styles.lede}>
          <Sentence parts={title.body} />
        </p>
      </div>
      <StillFigure act="change" className={`${styles.figure}`}>
        <div className={styles.host} data-ch-host="" />
        <Counter value={change.reach.runtime} steps={change.steps.length} done />
        <p className={`${styles.figureBlock} ${film.titleblock}`}>
          <span>Katedrala&rsquo;s analysis of CodeVerse</span>
          <span>{reachFact(change.reach.runtime, change.sourceFiles, change.path)}</span>
          <Status status="planned" label={IMPACT_STATUS} />
        </p>
      </StillFigure>
      <div className={`${styles.read} ${styles.beats}`}>
        {[subject, rise, reach].map((beat) => (
          <div key={beat.id} className={styles.beat}>
            <p className={styles.beatTitle}>
              <Sentence parts={beat.title} />
            </p>
            <p className={styles.beatBody}>
              <Sentence parts={beat.body} />{" "}
              {beat.more !== undefined && <Sentence parts={beat.more} />}
            </p>
            {beat.id === "change-rise" && (
              // Beside the step counts in the article; read once, with the totals below.
              <p className={styles.scope} aria-hidden="true">
                {SCOPE_LINE}
              </p>
            )}
            {beat.id === "change-reach" && <p className={styles.scope}>{SCOPE_LINE}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The counter of files reached, set like the level gauge, with a tick per step. */
function Counter({ value, steps, done = false }: { value: number; steps: number; done?: boolean }) {
  return (
    <div
      className={styles.counter}
      data-ch-counter=""
      data-obstacle=""
      data-done={done ? "" : undefined}
    >
      <span className={styles.counterValue} data-ch-value="">
        {formatCount(done ? value : 0)}
      </span>
      <span className={styles.counterLabel}>{COUNTER_LABEL}</span>
      <span className={styles.counterSteps}>
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={styles.counterStep}
            data-ch-step=""
            data-passed={done && i < steps - 1 ? "" : undefined}
            data-current={done && i === steps - 1 ? "" : undefined}
          />
        ))}
      </span>
    </div>
  );
}

export function ChangeFrame() {
  const { change, repository, commit, sourceFiles } = actFacts();
  const captions = changeCaptions(change);
  const scope = <p className={styles.scope}>{SCOPE_LINE}</p>;
  return (
    <div className={styles.frame} aria-hidden="true">
      <Captions
        act="change"
        captions={captions}
        windows={[CHANGE.c1, CHANGE.c2, CHANGE.c3, CHANGE.c4]}
        extra={{
          "change-title": <Status status="planned" />,
          "change-rise": scope,
          "change-reach": scope,
        }}
      />
      <Counter value={change.reach.runtime} steps={change.steps.length} />
      <p
        className={`${film.titleblock} ${styles.swap}`}
        data-ch-titleblock=""
        data-obstacle=""
        data-obstacle-pad="6"
      >
        <span>Katedrala&rsquo;s analysis of CodeVerse</span>
        <span>{sourceLine(repository, commit, sourceFiles)}</span>
        <Status status="planned" label={IMPACT_STATUS} />
      </p>
    </div>
  );
}
