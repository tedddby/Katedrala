"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { decideFilmMode, probeWebGL2 } from "./mode";
import styles from "./cinematic.module.css";

/**
 * The client island around the server-rendered film. It renders nothing of its own: on mount it hands its
 * subtree to the Film controller (imported on demand), which loads three.js, GSAP and the data in parallel.
 * On unmount the film releases everything it holds: its frame loop, observers, listeners, ScrollTrigger, WebGL
 * context and the attributes it set on <html>.
 */
export function FilmClient({ rest, children }: { rest: readonly number[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // The layout never changes after the build; a re-render must not restart the film.
  const restRef = useRef(rest);
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
    const noWebGL = noWebGLRef.current;
    if (noWebGL) html.dataset.kfilm = "still";
    // Fetch the stage (three.js) and the scroll clock alongside the director rather than after it: the director
    // imports the same modules again, and gets these. Only the film needs them: the still drawing (reduced motion,
    // no WebGL 2) is canvas 2D and never downloads either.
    if (html.dataset.kfilm === "film") {
      void import("./stage").catch(() => undefined);
      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).catch(() => undefined);
    }
    void import("./film").then(({ Film }) => {
      if (!cancelled) film = new Film(root, restRef.current, noWebGL);
    });
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
