import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { CaptionPart } from "../copy/hanging";
import type { ActId } from "../act";
import film from "../film.module.css";
import styles from "./acts.module.css";
import type { ActCaption } from "./copy";
import type { Span } from "./timing";

/**
 * A caption's words, set one by one so they drop into place as Act I's do (the film's caption styles). Hidden from
 * assistive technology with the whole caption list: the act's block says the same words, whole.
 */
function Words({ parts }: { parts: readonly CaptionPart[] }) {
  let word = 0;
  return (
    <span data-obstacle-box="">
      {parts.map((part, i) => {
        if (part.code === true) {
          return (
            <code key={i} className={film.word} style={{ "--w": word++ } as CSSProperties}>
              {part.text}
            </code>
          );
        }
        return part.text.split(/(\s+)/).map((w, j) =>
          w === "" ? null : /^\s+$/.test(w) ? (
            " "
          ) : (
            <span key={`${i}-${j}`} className={film.word} style={{ "--w": word++ } as CSSProperties}>
              {w}
            </span>
          ),
        );
      })}
    </span>
  );
}

/** A caption's words as a sentence, paths in the mono face: the narration's form. */
export function Sentence({ parts }: { parts: readonly CaptionPart[] }) {
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
 * An act's visual captions over the frame, in the film's caption column: each shown (data-on, set by the director)
 * while its act's local time is in its window. `extra` adds a line under a caption (a status mark, a scope line).
 */
export function Captions({
  act,
  captions,
  windows,
  extra = {},
  className,
}: {
  act: Exclude<ActId, "hang">;
  captions: readonly ActCaption[];
  windows: readonly Span[];
  extra?: Readonly<Record<string, ReactNode>>;
  className?: string;
}) {
  return (
    <ol
      className={className === undefined ? film.captions : `${film.captions} ${className}`}
      aria-hidden="true"
    >
      {captions.map((caption, i) => (
        <li
          key={caption.id}
          className={film.caption}
          data-caption={caption.id}
          data-act={act}
          data-from={windows[i]!.from}
          data-to={windows[i]!.to}
          data-obstacle=""
        >
          <p className={film.captionTitle}>
            <Words parts={caption.title} />
          </p>
          <p className={film.captionBody}>
            <Words parts={caption.body} />
          </p>
          {extra[caption.id] !== undefined && (
            <div className={styles.extra} data-obstacle-box="">
              {extra[caption.id]}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
