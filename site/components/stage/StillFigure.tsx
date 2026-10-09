import type { ReactNode } from "react";
import type { ActId } from "./act";
import styles from "./film.module.css";

/**
 * An act's figure in the still layout (reduced motion, no usable WebGL 2): the act's still camera and lighting drawn
 * once in Canvas 2D by the still controller (still.ts), with the act's labels and its overlay's words (children, or
 * what the overlay adds to the layer). Place it in the act's block where the drawing belongs. Absent from the film
 * (the pinned stage draws every act there) and without script. Hidden from assistive technology: the block's words
 * say what it shows.
 */
export function StillFigure({
  act,
  className,
  children,
}: {
  act: Exclude<ActId, "hang">;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <figure
      className={className === undefined ? styles.still : `${styles.still} ${className}`}
      data-still-act={act}
      aria-hidden="true"
    >
      <canvas className={styles.canvas} data-still-canvas />
      <svg className={styles.leaders} data-still-leaders />
      <div className={styles.labels} data-still-labels />
      <div className={styles.stillLayer} data-still-layer>
        {children}
      </div>
    </figure>
  );
}
