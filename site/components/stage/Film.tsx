import { Fragment, type CSSProperties, type ReactNode } from "react";
import { preload } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Status } from "@/components/ui/Status";
import { LINKS } from "@/lib/site";
import type { ActId } from "./act";
import { ChangeAct, ChangeFrame } from "./acts/ChangeAct";
import { EvidenceAct, EvidenceFrame } from "./acts/EvidenceAct";
import { LandingAct, LandingFrame } from "./acts/LandingAct";
import { actPayload } from "./acts/payload";
import { codeverse } from "./codeverse";
import { captionsOf, describe, type CaptionPart } from "./copy/hanging";
import { FilmClient } from "./FilmClient";
import { countOf, DATA_URL, restOf } from "./model";
import { ACTS, clockOf } from "./timeline";
import styles from "./film.module.css";
import "./film-global.css";

/** Where each act's anchor lands: stable ids, so old deep links to #evidence and #impact still find their act. */
const ANCHOR: Record<ActId, string> = {
  hang: "film-start",
  evidence: "evidence",
  change: "impact",
  trace: "trace",
};

/**
 * A caption's words, set one by one so they can drop into place like the weights. Hidden from assistive technology
 * with the whole visual caption list: the narration block says the same words, whole.
 */
function Parts({ parts }: { parts: readonly CaptionPart[] }) {
  let word = 0;
  return (
    <span data-obstacle-box="">
      {parts.map((part, i) => {
        if (part.code === true) {
          return (
            <code key={i} className={styles.word} style={{ "--w": word++ } as CSSProperties}>
              {part.text}
            </code>
          );
        }
        return part.text.split(/(\s+)/).map((w, j) =>
          w === "" ? null : /^\s+$/.test(w) ? (
            " "
          ) : (
            <span
              key={`${i}-${j}`}
              className={part.turns === true ? styles.turns : styles.word}
              data-turns={part.turns === true ? "" : undefined}
              style={{ "--w": word++ } as CSSProperties}
            >
              {w}
            </span>
          ),
        );
      })}
    </span>
  );
}

/** A caption's words as a sentence, paths in the mono face: the narration's form. */
function Sentence({ parts }: { parts: readonly CaptionPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.code === true ? (
          <code key={i}>{part.text}</code>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * The film: Katedrala's real analysis of CodeVerse, hung from its foundations like Gaudí's chain model, then turned
 * over so the architecture stands; then (Acts II, III and the landing) one real dependency down to its lines of code,
 * a change rising through everything that rests on a foundation, and any file traced. One pinned track, one clock
 * (timeline.ts).
 *
 * Every word is server-rendered, once: the hero, Act I's narration and each act's block, in reading order. In film
 * mode the blocks are read where they are (each act's block sits at its anchor in the track) while the visible
 * words are the word-split captions, hidden from assistive technology; in the still layout and without JavaScript
 * the same blocks are the visible article. The drawing is mounted client-side by FilmClient. Placed at the top of a
 * page it is the page's first section (id "top"); the sections after it simply follow the track.
 */
export function Film({ id = "top" }: { id?: string }) {
  // The stage fetches the analysis as soon as it mounts; start the download with the page instead.
  preload(DATA_URL, { as: "fetch", crossOrigin: "anonymous" });
  const { model, summary } = codeverse();
  const captions = captionsOf(summary);
  const description = describe(summary);
  const headline = ["See", "what", "your", "code", "stands", "on."];
  const wide = clockOf("wide");
  const tall = clockOf("tall");
  const round = (v: number) => Math.round(v * 10000) / 10000;
  // Positions on the track, in viewports of pinned scroll, for both framings (the stylesheet picks one).
  const at = (index: number) =>
    ({
      "--k-at-wide": round(wide.anchorOf(index)),
      "--k-at-tall": round(tall.anchorOf(index)),
      "--k-from-wide": round(wide.spans[index]!.from),
      "--k-from-tall": round(tall.spans[index]!.from),
    }) as CSSProperties;
  const blocks: Record<Exclude<ActId, "hang">, { block: ReactNode; frame: ReactNode }> = {
    evidence: { block: <EvidenceAct />, frame: <EvidenceFrame /> },
    change: { block: <ChangeAct />, frame: <ChangeFrame /> },
    trace: { block: <LandingAct />, frame: <LandingFrame /> },
  };

  return (
    <FilmClient rest={restOf(model)} payload={actPayload()}>
      <section id={id} className={styles.section} aria-labelledby="film-title">
        <div
          className={styles.track}
          data-film-track
          style={
            {
              "--k-track-wide": round(wide.length + 1),
              "--k-track-tall": round(tall.length + 1),
            } as CSSProperties
          }
        >
          <div className={styles.sticky}>
            <div className={styles.frame} data-film-stage>
              <canvas className={styles.canvas} data-film-canvas aria-hidden="true" />
              <svg className={styles.leaders} data-film-leaders aria-hidden="true" />
              <div className={styles.labels} data-film-labels aria-hidden="true" />

              <div className={styles.hero} data-film-hero data-obstacle="">
                <h1 className={styles.headline}>
                  <span aria-hidden="true">
                    {headline.map((w, i) => (
                      <Fragment key={w}>
                        <span className={styles.hword} style={{ "--w": i } as CSSProperties}>
                          {w}
                        </span>
                        {i < headline.length - 1 ? " " : null}
                      </Fragment>
                    ))}
                  </span>
                  <span id="film-title" className={styles.srOnly}>
                    {headline.join(" ")}
                  </span>
                </h1>
                <p className={styles.lede}>
                  Katedrala reconstructs the architecture inside TypeScript and JavaScript code,
                  with evidence for every&nbsp;dependency&nbsp;it&nbsp;finds.
                </p>
                <div className={styles.actions}>
                  <Button href="#film-start">Explore Katedrala</Button>
                  <Button href={LINKS.repository} variant="secondary">
                    View on GitHub
                  </Button>
                </div>
              </div>

              <div className={styles.gauge} data-film-gauge data-obstacle="" aria-hidden="true">
                <span className={styles.gaugeValue}>
                  <span className={styles.gaugeSign}>+</span>
                  <span data-film-level>00</span>
                </span>
                <span className={styles.gaugeLabel}>level above the ground</span>
                <span className={styles.gaugeTicks}>
                  {Array.from({ length: summary.levels }, (_, i) => (
                    <span key={i} className={styles.tick} data-tick={summary.levels - 1 - i} />
                  ))}
                </span>
              </div>

              <p
                className={styles.titleblock}
                data-film-titleblock
                data-obstacle="always"
                data-obstacle-pad="6"
              >
                <span>Katedrala&rsquo;s analysis of CodeVerse</span>
                <span>
                  {summary.repository} at {summary.commit},{" "}
                  {countOf(summary.sourceFiles, "source file")}
                </span>
                <Status status="available" label="Dependency graph, available today" />
                <span className={styles.fallbackNote} data-film-fallback hidden>
                  Drawn without WebGL: the standing structure, still
                </span>
              </p>

              {(["evidence", "change", "trace"] as const).map((act) => (
                <div key={act} className={styles.layer} data-act-layer={act}>
                  {blocks[act].frame}
                </div>
              ))}
            </div>

            <ol className={styles.captions} aria-hidden="true">
              {captions.map((caption) => (
                <li
                  key={caption.id}
                  className={styles.caption}
                  data-caption={caption.id}
                  data-act="hang"
                  data-from={caption.from}
                  data-to={caption.to}
                  data-obstacle=""
                >
                  <p className={styles.captionTitle}>
                    <Parts parts={caption.title} />
                  </p>
                  <p className={styles.captionBody}>
                    <Parts parts={caption.body} />
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {ACTS.map((act, index) => (
            <Fragment key={act.id}>
              <span id={ANCHOR[act.id]} className={styles.anchor} style={at(index)} />
              {act.id === "hang" ? (
                <div
                  className={`${styles.slot} ${styles.narration}`}
                  data-act-slot="hang"
                  style={at(index)}
                >
                  {captions.map((caption) => (
                    <div key={caption.id} className={styles.beat}>
                      <p className={styles.beatTitle}>
                        <Sentence parts={caption.title} />
                      </p>
                      <p className={styles.beatBody}>
                        <Sentence parts={caption.body} />
                        {caption.more !== undefined && (
                          <>
                            {" "}
                            <Sentence parts={caption.more} />
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                  <div className={styles.srOnly}>
                    {description.map((sentence) => (
                      <p key={sentence}>{sentence}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className={act.id === "trace" ? styles.slotPinned : styles.slot}
                  data-act-slot={act.id}
                  style={at(index)}
                >
                  {blocks[act.id].block}
                </div>
              )}
            </Fragment>
          ))}
        </div>
        {/* Outside the frame, so a trace kept from the drawing is announced wherever the film is. */}
        <p className={styles.srOnly} role="status" aria-atomic="true" data-film-status />
        <div id={`${id === "top" ? "film" : id}-end`} className={styles.end} tabIndex={-1} />
      </section>
    </FilmClient>
  );
}
