import type { ReactNode } from "react";

interface TitleBlockProps {
  /**
   * Line 1, what the drawing is of: "Demonstration system", or "Katedrala's analysis of CodeVerse" for real
   * output. Real versus demonstration is always stated here, as in the film.
   */
  readonly subject: ReactNode;
  /** Line 2: one fact about what is drawn, computed from the data the drawing shows, never typed by hand. */
  readonly fact?: ReactNode;
  /** Line 3: the status of the capability the drawing shows, as a <Status /> mark. */
  readonly status?: ReactNode;
  /**
   * On a <Plate>: "auto" (the default) sets it under the drawing on phones and over the drawing's bottom right
   * corner, inside the crop marks, from 768 px; "overlay" and "below" hold one placement at every width. Outside
   * a plate it sits at the right of its line.
   */
  readonly place?: "auto" | "overlay" | "below";
  readonly id?: string;
  readonly className?: string;
}

/**
 * A drawing's title block, set as the film sets its own: mono micro type on a ground that knocks the drawing out
 * behind it, the subject a step brighter than the lines under it. Each line is phrasing content. Between lines a
 * full stop is spoken but not shown, so the block is read as its three statements, never as one run of words.
 */
export function TitleBlock({
  subject,
  fact,
  status,
  place = "auto",
  id,
  className,
}: TitleBlockProps) {
  return (
    <p
      id={id}
      className={className === undefined ? "titleblock" : `titleblock ${className}`}
      data-place={place === "auto" ? undefined : place}
    >
      <span>
        {subject}
        {(fact !== undefined || status !== undefined) && <Stop />}
      </span>
      {fact !== undefined && (
        <span>
          {fact}
          {status !== undefined && <Stop />}
        </span>
      )}
      {status}
    </p>
  );
}

/** The end of a line, for assistive technology only: in the line's own run of text, taking no room. */
function Stop() {
  return <span className="titleblock-stop">. </span>;
}
