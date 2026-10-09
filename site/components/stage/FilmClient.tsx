"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { decideFilmMode, probeWebGL2 } from "./mode";
import styles from "./film.module.css";

/**
 * The client island around the server-rendered film. It renders nothing of its own: on mount it hands its subtree
 * to the director (film mode: three.js, GSAP and the data, imported on demand) or to the still controller (Canvas 2D,
 * neither library). On unmount the film releases everything it holds: its frame loop, observers, listeners,
 * ScrollTrigger, WebGL context and the attributes it set on <html>.
 */
export function FilmClient({
  rest,
  payload,
  children,
}: {
  rest: readonly number[];
  payload: unknown;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The layout never changes after the build; a re-render must not restart the film.
  const restRef = useRef(rest);
  const payloadRef = useRef(payload);
  // Probed once per mount of this island (a development remount must not probe again and lose the answer).
  const noWebGLRef = useRef<boolean | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;
    const html = document.documentElement;
    // Arrived by client-side navigation (or remounted): the inline script that decides the mode has not run for it.
    if (html.dataset.kfilm === undefined) decideFilmMode();
    let film: { dispose(): void } | null = null;
    let cancelled = false;
    // The API alone does not promise a context: without one, the still layout takes over now, before anything else
    // is fetched.
    noWebGLRef.current ??= html.dataset.kfilm === "film" && !probeWebGL2();
    if (noWebGLRef.current) html.dataset.kfilm = "still";
    const running = html.dataset.kfilm === "film";
    // Still because WebGL 2 is missing or unusable (not by the visitor's choice of reduced motion): the title block
    // says so.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = {
      rest: restRef.current,
      payload: payloadRef.current,
      noWebGL: !running && !reduce,
    };
    if (running) {
      // Fetch the stage (three.js) and the scroll clock alongside the director rather than after it: the director
      // imports the same modules again, and gets these. Only the film needs them, and only once the probe has
      // passed: the still drawing never downloads either.
      void import("./stage").catch(() => undefined);
      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).catch(() => undefined);
      void import("./director").then(({ Director }) => {
        if (cancelled) return;
        if (html.dataset.kfilm === "film") {
          film = new Director(root, options);
          return;
        }
        // The film's code came too late (the mode script has shown the still layout meanwhile): stay still.
        void import("./still").then(({ StillFilm }) => {
          if (!cancelled) film = new StillFilm(root, { ...options, noWebGL: false });
        });
      });
    } else {
      void import("./still").then(({ StillFilm }) => {
        if (!cancelled) film = new StillFilm(root, options);
      });
    }
    return () => {
      cancelled = true;
      film?.dispose();
    };
  }, []);

  return (
    <div ref={ref} className={styles.film}>
      {children}
    </div>
  );
}
