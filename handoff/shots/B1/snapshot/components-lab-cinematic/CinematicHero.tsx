import { Fragment, type CSSProperties } from "react";
import { preload } from "react-dom";
import { Status } from "@/components/ui/Status";
import { LINKS } from "@/lib/site";
import graph from "@/public/data/codeverse-graph.json";
import { captionsOf, describe, fileNote, plainOf, type CaptionPart } from "./copy";
import { FilmClient } from "./FilmClient";
import { MODE_SCRIPT } from "./mode";
import {
  buildModel,
  countOf,
  DATA_URL,
  formatCount,
  loadPathOf,
  restOf,
  summarize,
  type GraphData,
} from "./model";
import styles from "./cinematic.module.css";
import "./film-global.css";

/**
 * A caption's words, set one by one so they can drop into place like the weights. Hidden from assistive
 * technology: the sentence beside it (plainOf) is what is read, whole, wherever the film is.
 */
function Parts({ parts }: { parts: readonly CaptionPart[] }) {
  let word = 0;
  return (
    <span aria-hidden="true">
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

/**
 * The film: Katedrala's real analysis of CodeVerse, hung from its foundations like Gaudí's chain model, then
 * turned over so the architecture stands. Every word is server-rendered (the narration, the closing card, a full
 * text alternative); the drawing is mounted client-side by FilmClient. Placed at the top of a page, it is the
 * page's first section (id "top"); the sections after it simply follow the track, and "Skip the film" jumps to
 * them.
 */
export function CinematicHero({ id = "top" }: { id?: string }) {
  // The stage fetches the analysis as soon as it mounts; start the download with the page instead.
  preload(DATA_URL, { as: "fetch", crossOrigin: "anonymous" });
  const data = graph as unknown as GraphData;
  const model = buildModel(data);
  const summary = summarize(model, data);
  const captions = captionsOf(summary);
  const description = describe(summary);
  const crown = summary.crown;
  const indexOf = new Map(model.paths.map((path, v) => [path, v]));
  const tests = [crown.path, ...summary.heaviest.slice(0, 3).map((h) => h.path)].map((path) => {
    const v = indexOf.get(path)!;
    return { path, note: fileNote(model, v, loadPathOf(model, v), true) };
  });
  const headline = ["See", "what", "your", "code", "stands", "on."];
  const endId = `${id}-end`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      <FilmClient rest={restOf(model)}>
        <section
          id={id}
          className={styles.section}
          aria-labelledby="film-title"
          aria-describedby="film-description"
        >
          <a className="skip-link" href={`#${endId}`} data-film-skip>
            Skip the film
          </a>
          <div className={styles.track} data-film-track>
            <div className={styles.sticky}>
              <div className={styles.frame} data-film-stage>
                <canvas className={styles.canvas} data-film-canvas aria-hidden="true" />
                <svg className={styles.leaders} data-film-leaders aria-hidden="true" />
                <div className={styles.labels} data-film-labels aria-hidden="true" />

                <div className={styles.hero} data-film-hero>
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
                    <a
                      className={`${styles.button} ${styles.primary}`}
                      href={LINKS.readme}
                      rel="noopener"
                    >
                      Get started<span className={styles.srOnly}> on GitHub</span>
                    </a>
                    <a
                      className={`${styles.button} ${styles.secondary}`}
                      href={LINKS.repository}
                      rel="noopener"
                    >
                      View on GitHub
                      <svg aria-hidden="true" viewBox="0 0 12 12" className={styles.external}>
                        <path
                          d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                      </svg>
                    </a>
                  </div>
                </div>

                <div className={styles.gauge} data-film-gauge aria-hidden="true">
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

                <p className={styles.titleblock} data-film-titleblock>
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
              </div>

              <ol
                className={styles.captions}
                data-film-captions
                aria-label="The film, step by step"
              >
                {captions.map((caption) => (
                  <li
                    key={caption.id}
                    className={styles.caption}
                    data-caption={caption.id}
                    data-from={caption.from}
                    data-to={caption.to}
                  >
                    <p className={styles.captionTitle}>
                      <Parts parts={caption.title} />
                      <span className={styles.srOnly}>{plainOf(caption.title)}</span>
                    </p>
                    <p className={styles.captionBody}>
                      <Parts parts={caption.body} />
                      <span className={styles.srOnly}>{plainOf(caption.body)}</span>
                    </p>
                  </li>
                ))}
              </ol>

              <aside className={styles.card} data-film-card aria-labelledby="film-crown">
                <p className={styles.cardPath} id="film-crown">
                  <code>{crown.path}</code>
                </p>
                <p className={styles.cardText}>
                  The crown of CodeVerse, {crown.level} levels up. It depends directly on{" "}
                  {countOf(crown.direct, "file")}, and through it stands on{" "}
                  {countOf(crown.supports, "file")}, {formatCount(crown.foundations)} of them
                  foundations.
                </p>
                <p className={styles.cardHint} id="film-trace">
                  Hover or tap any file to trace what it stands on.
                </p>
                <ul className={styles.tests} aria-labelledby="film-trace">
                  {tests.map((test, i) => (
                    <li key={test.path}>
                      <button
                        type="button"
                        className={styles.test}
                        data-file={test.path}
                        aria-pressed="false"
                        aria-describedby={`film-trace-${i}`}
                      >
                        <code>{test.path}</code>
                      </button>
                      <span id={`film-trace-${i}`} className={styles.srOnly}>
                        {test.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
          {/* Outside the card, so a trace kept from the drawing is announced wherever the film is. */}
          <p className={styles.srOnly} role="status" aria-atomic="true" data-film-status />
          <div id="film-description" className={styles.srOnly}>
            {description.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
          <div id={endId} className={styles.end} tabIndex={-1} data-film-end />
        </section>
      </FilmClient>
    </>
  );
}
